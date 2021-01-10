// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./lib/SafeMathInt.sol";
import "./CouponsToDebaseCurve.sol";
import "./DebtToCouponsCurve.sol";

contract BurnPool is Ownable, CouponsToDebaseCurve, DebtToCouponsCurve {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using SafeMathInt for int256;

    event LogStartNewDistributionCycle(
        uint256 poolShareAdded_,
        uint256 rewardRate_,
        uint256 periodFinish_
    );

    address public policy;
    address public burnPool1;
    address public burnPool2;

    IERC20 public debase;
    uint256 public debtBalance;
    uint256 public blockDuration;
    uint256 public rewardRate;
    uint256 public periodFinish;
    uint256 public lastUpdateBlock;
    uint256 public rewardPerTokenStored;
    uint256 public rewardDistributed;

    bool public lastRebaseWasNotNegative;
    uint256 public negativeRebaseCount;

    mapping(address => uint256) userCouponBalances;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    bytes16 mean;
    bytes16 deviation;
    bytes16 oneDivDeviationSqrtTwoPi;
    bytes16 twoDeviationSquare;

    uint256 public couponsIssued;
    uint256 public epochs;
    uint256 public couponsPerEpoch;

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateBlock = lastBlockRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    function setMeanAndDeviationWithFormulaConstants(
        bytes16 mean_,
        bytes16 deviation_,
        bytes16 oneDivDeviationSqrtTwoPi_,
        bytes16 twoDeviationSquare_
    ) external onlyOwner {
        mean = mean_;
        deviation = deviation_;
        oneDivDeviationSqrtTwoPi = oneDivDeviationSqrtTwoPi_;
        twoDeviationSquare = twoDeviationSquare_;
    }

    constructor(
        address debase_,
        address policy_,
        address burnPool1_,
        address burnPool2_
    ) public {
        debase = IERC20(debase_);
        burnPool1 = burnPool1_;
        burnPool2 = burnPool2_;
        policy = policy_;
    }

    function getCirculatinShare() internal view returns (uint256) {
        uint256 totalSupply = debase.totalSupply();

        uint256 circulatingSupply =
            totalSupply.sub(debase.balanceOf(burnPool1)).sub(
                debase.balanceOf(burnPool2)
            );

        return circulatingSupply.mul(10**18).div(totalSupply);
    }

    function checkStabilizerAndGetReward(
        int256 supplyDelta_,
        int256 rebaseLag_,
        uint256 exchangeRate_,
        uint256 debasePolicyBalance
    ) external returns (uint256 rewardAmount_) {
        require(
            msg.sender == policy,
            "Only debase policy contract can call this"
        );

        uint256 supplyDeltaScaled =
            uint256(supplyDelta_.abs()).mul(uint256(rebaseLag_.abs()));

        uint256 debaseSupply = debase.totalSupply();
        uint256 circulatingShare = getCirculatinShare();

        if (supplyDelta_ < 0) {
            uint256 newSupply = debaseSupply.sub(supplyDeltaScaled);

            if (lastRebaseWasNotNegative) {
                couponsIssued = 0;
                lastRebaseWasNotNegative = false;
            }

            debtBalance.add(newSupply.mul(circulatingShare).div(10**18));
        } else if (couponsIssued != 0) {
            if (block.number > periodFinish) {
                debtBalance = 0;
                negativeRebaseCount = 0;
                lastRebaseWasNotNegative = true;
                couponsPerEpoch = couponsIssued.div(epochs);
            }

            uint256 debaseToBeRewarded =
                calculateCouponsToDebase(
                    couponsPerEpoch,
                    exchangeRate_,
                    mean,
                    oneDivDeviationSqrtTwoPi,
                    twoDeviationSquare
                );

            if (debaseToBeRewarded <= debasePolicyBalance) {
                startNewDistributionCycle(debaseToBeRewarded);
                return debaseToBeRewarded;
            }
        }

        return 0;
    }

    function buyDebt(uint256 debtAmountToBuy) external {
        debtBalance = debtBalance.sub(debtAmountToBuy);
        couponsIssued = couponsIssued.add(debtAmountToBuy);
        debase.transfer(address(this), debtAmountToBuy);
    }

    function emergencyWithdraw() external {
        debase.safeTransfer(policy, debase.balanceOf(address(this)));
    }

    function lastBlockRewardApplicable() internal view returns (uint256) {
        return Math.min(block.number, periodFinish);
    }

    function rewardPerToken() public view returns (uint256) {
        if (couponsIssued == 0) {
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored.add(
                lastBlockRewardApplicable()
                    .sub(lastUpdateBlock)
                    .mul(rewardRate)
                    .mul(10**18)
                    .div(couponsIssued)
            );
    }

    function earned(address account) public view returns (uint256) {
        return
            userCouponBalances[account]
                .mul(rewardPerToken().sub(userRewardPerTokenPaid[account]))
                .div(10**18);
    }

    function getReward() public updateReward(msg.sender) {
        uint256 reward = earned(msg.sender);
        if (reward > 0) {
            rewards[msg.sender] = 0;

            uint256 rewardToClaim =
                debase.totalSupply().mul(reward).div(10**18);

            debase.safeTransfer(msg.sender, rewardToClaim);
            rewardDistributed = rewardDistributed.add(reward);
        }
    }

    function startNewDistributionCycle(uint256 amount)
        internal
        updateReward(address(0))
    {
        uint256 poolTotalShare = amount.mul(10**18).div(debase.totalSupply());

        rewardRate = poolTotalShare.div(blockDuration);
        lastUpdateBlock = block.number;
        periodFinish = block.number.add(blockDuration);

        emit LogStartNewDistributionCycle(
            poolTotalShare,
            rewardRate,
            periodFinish
        );
    }
}
