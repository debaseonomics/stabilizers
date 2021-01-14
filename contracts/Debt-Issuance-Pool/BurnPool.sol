// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./lib/SafeMathInt.sol";
import "./Curve.sol";

interface IDebasePolicy {
    function minRebaseTimeIntervalSec() external view returns (uint256);

    function upperDeviationThreshold() external view returns (uint256);

    function lowerDeviationThreshold() external view returns (uint256);

    function priceTargetRate() external view returns (uint256);
}

contract BurnPool is Ownable, Curve {
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

    bytes16 mean;
    bytes16 deviation;
    bytes16 oneDivDeviationSqrtTwoPi;
    bytes16 twoDeviationSquare;

    uint256 public epochs;
    uint256 public couponPremium;
    uint256 public totalRewardsDistributed;

    uint256 public rewardsAccured;

    enum Rebase {NEGATIVE, NOT_NEGATIVE, NONE}
    Rebase public lastRebase;

    struct RewardCycle {
        uint256 epochsToReward;
        uint256 epochsRewarded;
        uint256 rewardAmount;
        uint256 couponsIssued;
        uint256 rewardRate;
        uint256 periodFinish;
        uint256 lastUpdateTime;
        uint256 rewardPerTokenStored;
        uint256 couponsPerEpoch;
        uint256 rewardDistributed;
        mapping(address => uint256) userCouponBalances;
        mapping(address => uint256) userRewardPerTokenPaid;
        mapping(address => uint256) rewards;
    }

    RewardCycle[] public rewardCycles;

    modifier updateReward(address account, uint256 index) {
        RewardCycle storage instance = rewardCycles[index];

        instance.rewardPerTokenStored = rewardPerToken(index);
        instance.lastUpdateTime = lastRewardApplicable(index);
        if (account != address(0)) {
            instance.rewards[account] = earned(account, index);
            instance.userRewardPerTokenPaid[account] = rewardCycles[index]
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

    function setCouponPremium(uint256 couponPremium_) external onlyOwner {
        require(couponPremium != 0);
        couponPremium = couponPremium_;
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

        lastRebase = Rebase.NONE;
    }

    function circBalanceChange(uint256 supplyDeltaScaled)
        internal
        view
        returns (uint256)
    {
        uint256 totalSupply = debase.totalSupply();

        uint256 circulatingSupply =
            totalSupply.sub(debase.balanceOf(burnPool1)).sub(
                debase.balanceOf(burnPool2)
            );

        uint256 circulatingShare =
            circulatingSupply.mul(10**18).div(totalSupply);

        return supplyDeltaScaled.mul(circulatingShare).div(10**18);
    }

    function startNewCouponCycle() internal {
        if (lastRebase == Rebase.NONE || lastRebase == Rebase.NOT_NEGATIVE) {
            lastRebase = Rebase.NEGATIVE;
            rewardCycles.push(
                RewardCycle(epochs, 0, rewardsAccured, 0, 0, 0, 0, 0, 0, 0)
            );
            rewardsAccured = 0;
        }
    }

    function issueRewards(uint256 exchangeRate_, uint256 debasePolicyBalance)
        internal
        returns (uint256)
    {
        RewardCycle storage instance = rewardCycles[rewardCycles.length.sub(1)];

        if (lastRebase == Rebase.NEGATIVE) {
            lastRebase = Rebase.NOT_NEGATIVE;
            instance.couponsPerEpoch = instance.couponsIssued.div(epochs);
        }

        instance.epochsRewarded = instance.epochsRewarded.add(1);

        uint256 targetRate =
            policy.priceTargetRate().add(policy.upperDeviationThreshold());

        uint256 offset = exchangeRate_.sub(targetRate);

        uint256 debaseToBeRewarded =
            getCurvePoint(
                instance.couponsPerEpoch,
                offset,
                mean,
                oneDivDeviationSqrtTwoPi,
                twoDeviationSquare
            );

        if (debaseToBeRewarded <= debasePolicyBalance) {
            startNewDistributionCycle(debaseToBeRewarded);
            return debaseToBeRewarded;
        }
        return 0;
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

        if (supplyDelta_ < 0) {
            startNewCouponCycle();
        } else {
            if (supplyDelta_ != 0) {
                uint256 supplyDeltaScaled =
                    uint256(supplyDelta_.abs()).mul(uint256(rebaseLag_.abs()));

                rewardsAccured.add(circBalanceChange(supplyDeltaScaled));
            }

            uint256 length = rewardCycles.length;

            if (
                length != 0 &&
                rewardCycles[length.sub(1)].couponsIssued != 0 &&
                rewardCycles[length.sub(1)].epochsRewarded != epochs
            ) {
                return issueRewards(exchangeRate_, debasePolicyBalance);
            }
        }

        return 0;
    }

    function buyDebt(uint256 debaseSent) external {
        RewardCycle storage instance = rewardCycles[rewardCycles.length.sub(1)];

        uint256 couponsIssuedToUser = debaseSent.mul(couponPremium);
        instance.couponsIssued = instance.couponsIssued.add(
            couponsIssuedToUser
        );

        instance.userCouponBalances[msg.sender] = instance.userCouponBalances[
            msg.sender
        ]
            .add(couponsIssuedToUser);

        debase.transfer(address(this), debaseSent);
    }

    function emergencyWithdraw() external {
        debase.safeTransfer(address(policy), debase.balanceOf(address(this)));
    }

    function lastRewardApplicable(uint256 index)
        internal
        view
        returns (uint256)
    {
        return Math.min(block.timestamp, rewardCycles[index].periodFinish);
    }

    function rewardPerToken(uint256 index) public view returns (uint256) {
        RewardCycle memory instance = rewardCycles[index];

        if (instance.couponsIssued == 0) {
            return instance.rewardPerTokenStored;
        }
        return
            instance.rewardPerTokenStored.add(
                lastRewardApplicable(index)
                    .sub(instance.lastUpdateTime)
                    .mul(instance.rewardRate)
                    .mul(10**18)
                    .div(instance.couponsIssued)
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
            RewardCycle storage instance = rewardCycles[index];

            instance.rewards[msg.sender] = 0;

            uint256 rewardToClaim =
                debase.totalSupply().mul(reward).div(10**18);

            instance.rewardDistributed = instance.rewardDistributed.add(reward);
            totalRewardsDistributed = totalRewardsDistributed.add(reward);
            debase.safeTransfer(msg.sender, rewardToClaim);
        }
    }

    function startNewDistributionCycle(uint256 amount)
        internal
        updateReward(address(0), rewardCycles.length.sub(1))
    {
        RewardCycle storage instance = rewardCycles[rewardCycles.length.sub(1)];

        uint256 poolTotalShare = amount.mul(10**18).div(debase.totalSupply());
        uint256 duration = policy.minRebaseTimeIntervalSec();

        instance.rewardRate = poolTotalShare.div(duration);
        instance.lastUpdateTime = block.timestamp;
        instance.periodFinish = block.timestamp.add(duration);

        emit LogStartNewDistributionCycle(
            poolTotalShare,
            instance.rewardRate,
            instance.periodFinish
        );
    }
}
