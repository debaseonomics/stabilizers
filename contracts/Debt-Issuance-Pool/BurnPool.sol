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

interface IDebasePolicy {
    function minRebaseTimeIntervalSec() external view returns (uint256);

    function upperDeviationThreshold() external view returns (uint256);

    function lowerDeviationThreshold() external view returns (uint256);

    function priceTargetRate() external view returns (uint256);
}

contract BurnPool is Ownable, CouponsToDebaseCurve, DebtToCouponsCurve {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using SafeMathInt for int256;

    event LogStartNewDistributionCycle(
        uint256 poolShareAdded_,
        uint256 rewardRate_,
        uint256 periodFinish_
    );

    IDebasePolicy public policy;
    address public burnPool1;
    address public burnPool2;

    IERC20 public debase;
    uint256 public rewardDistributed;

    bool public lastRebaseWasNotNegative;

    bytes16 mean;
    bytes16 deviation;
    bytes16 oneDivDeviationSqrtTwoPi;
    bytes16 twoDeviationSquare;

    uint256 public epochs;
    uint256 public epochsRewarded;
    uint256 public couponsRevokePercentage;
    uint256 public debtToCouponMultiplier;

    struct RewardCycle {
        uint256 debtBalance;
        uint256 couponsIssued;
        uint256 rewardRate;
        uint256 periodFinish;
        uint256 lastUpdateTime;
        uint256 rewardPerTokenStored;
        uint256 couponsPerEpoch;
        mapping(address => uint256) userCouponBalances;
        mapping(address => uint256) userRewardPerTokenPaid;
        mapping(address => uint256) rewards;
    }

    RewardCycle[] public rewardCycles;

    modifier updateReward(address account, uint256 index) {
        rewardCycles[index].rewardPerTokenStored = rewardPerToken(index);
        rewardCycles[index].lastUpdateTime = lastBlockRewardApplicable(index);
        if (account != address(0)) {
            rewardCycles[index].rewards[account] = earned(account, index);
            rewardCycles[index].userRewardPerTokenPaid[account] = rewardCycles[
                index
            ]
                .rewardPerTokenStored;
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
        IDebasePolicy policy_,
        address burnPool1_,
        address burnPool2_
    ) public {
        debase = IERC20(debase_);
        burnPool1 = burnPool1_;
        burnPool2 = burnPool2_;
        policy = policy_;
    }

    function getCirculatinSupplyAndShare()
        internal
        view
        returns (uint256, uint256)
    {
        uint256 totalSupply = debase.totalSupply();

        uint256 circulatingSupply =
            totalSupply.sub(debase.balanceOf(burnPool1)).sub(
                debase.balanceOf(burnPool2)
            );

        return (
            circulatingSupply,
            circulatingSupply.mul(10**18).div(totalSupply)
        );
    }

    function checkStabilizerAndGetReward(
        int256 supplyDelta_,
        int256 rebaseLag_,
        uint256 exchangeRate_,
        uint256 debasePolicyBalance
    ) external returns (uint256 rewardAmount_) {
        require(
            msg.sender == address(policy),
            "Only debase policy contract can call this"
        );

        uint256 supplyDeltaScaled =
            uint256(supplyDelta_.abs()).mul(uint256(rebaseLag_.abs()));

        uint256 debaseSupply = debase.totalSupply();

        uint256 circulatingBalance;
        uint256 circulatingShare;

        (circulatingBalance, circulatingShare) = getCirculatinSupplyAndShare();
        uint256 length = rewardCycles.length;

        if (supplyDelta_ < 0) {
            uint256 newSupply = debaseSupply.sub(supplyDeltaScaled);

            if (lastRebaseWasNotNegative || length == 0) {
                lastRebaseWasNotNegative = false;
                rewardCycles.push(RewardCycle(0, 0, 0, 0, 0, 0, 0));
            } else {
                uint256 lastIndex = length.sub(1);

                rewardCycles[lastIndex].couponsIssued = rewardCycles[lastIndex]
                    .couponsIssued
                    .sub(
                    rewardCycles[lastIndex].couponsIssued.mul(
                        couponsRevokePercentage
                    )
                );
            }

            uint256 index = length.sub(1);

            uint256 targetRate =
                policy.priceTargetRate().sub(policy.lowerDeviationThreshold());

            uint256 offset = targetRate.sub(exchangeRate_);

            debtToCouponMultiplier = calculateDebtToCouponsMultiplier(
                offset,
                mean,
                oneDivDeviationSqrtTwoPi,
                twoDeviationSquare
            );

            uint256 newCirculatingBalance =
                newSupply.mul(circulatingShare).div(10**18);

            rewardCycles[index].debtBalance.add(
                circulatingBalance.sub(newCirculatingBalance)
            );
        } else if (
            length != 0 &&
            rewardCycles[length.sub(1)].couponsIssued != 0 &&
            epochsRewarded != epochs
        ) {
            uint256 index = length.sub(1);
            epochsRewarded = epochsRewarded.add(1);

            if (block.timestamp > rewardCycles[index].periodFinish) {
                lastRebaseWasNotNegative = true;
                rewardCycles[index].couponsPerEpoch = rewardCycles[index]
                    .couponsIssued
                    .div(epochs);
            }

            uint256 targetRate =
                policy.priceTargetRate().add(policy.upperDeviationThreshold());

            uint256 offset = exchangeRate_.sub(targetRate);

            uint256 debaseToBeRewarded =
                calculateCouponsToDebase(
                    rewardCycles[index].couponsPerEpoch,
                    offset,
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
        uint256 lastIndex = rewardCycles.length.sub(1);
        uint256 couponsToSend = debtAmountToBuy.mul(debtToCouponMultiplier);

        rewardCycles[lastIndex].debtBalance = rewardCycles[lastIndex]
            .debtBalance
            .sub(debtAmountToBuy);
        rewardCycles[lastIndex].couponsIssued = rewardCycles[lastIndex]
            .couponsIssued
            .add(couponsToSend);

        rewardCycles[lastIndex].userCouponBalances[msg.sender] = couponsToSend;
        debase.transfer(address(this), couponsToSend);
    }

    function emergencyWithdraw() external {
        debase.safeTransfer(address(policy), debase.balanceOf(address(this)));
    }

    function lastBlockRewardApplicable(uint256 index)
        internal
        view
        returns (uint256)
    {
        return Math.min(block.timestamp, rewardCycles[index].periodFinish);
    }

    function rewardPerToken(uint256 index) public view returns (uint256) {
        if (rewardCycles[index].couponsIssued == 0) {
            return rewardCycles[index].rewardPerTokenStored;
        }
        return
            rewardCycles[index].rewardPerTokenStored.add(
                lastBlockRewardApplicable(index)
                    .sub(rewardCycles[index].lastUpdateTime)
                    .mul(rewardCycles[index].rewardRate)
                    .mul(10**18)
                    .div(rewardCycles[index].couponsIssued)
            );
    }

    function earned(address account, uint256 index)
        public
        view
        returns (uint256)
    {
        return
            rewardCycles[index].userCouponBalances[account]
                .mul(
                rewardPerToken(index).sub(
                    rewardCycles[index].userRewardPerTokenPaid[account]
                )
            )
                .div(10**18);
    }

    function getReward(uint256 index) public updateReward(msg.sender, index) {
        uint256 reward = earned(msg.sender, index);
        if (reward > 0) {
            rewardCycles[index].rewards[msg.sender] = 0;

            uint256 rewardToClaim =
                debase.totalSupply().mul(reward).div(10**18);

            debase.safeTransfer(msg.sender, rewardToClaim);
            rewardDistributed = rewardDistributed.add(reward);
        }
    }

    function startNewDistributionCycle(uint256 amount)
        internal
        updateReward(address(0), rewardCycles.length.sub(1))
    {
        uint256 poolTotalShare = amount.mul(10**18).div(debase.totalSupply());
        uint256 duration = policy.minRebaseTimeIntervalSec();
        uint256 index = rewardCycles.length.sub(1);

        rewardCycles[index].rewardRate = poolTotalShare.div(duration);
        rewardCycles[index].lastUpdateTime = block.timestamp;
        rewardCycles[index].periodFinish = block.timestamp.add(duration);

        emit LogStartNewDistributionCycle(
            poolTotalShare,
            rewardCycles[index].rewardRate,
            rewardCycles[index].periodFinish
        );
    }
}
