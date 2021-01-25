// SPDX-License-Identifier: MIT
/*

██████╗ ███████╗██████╗  █████╗ ███████╗███████╗
██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝██╔════╝
██║  ██║█████╗  ██████╔╝███████║███████╗█████╗  
██║  ██║██╔══╝  ██╔══██╗██╔══██║╚════██║██╔══╝  
██████╔╝███████╗██████╔╝██║  ██║███████║███████╗
╚═════╝ ╚══════╝╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝
                                               

* Debase: BurnPool.sol
* Description:
* Pool that issues coupons for debase sent to it. Then rewards those coupons when positive rebases happen
* Coded by: punkUnknown
*/
pragma solidity >=0.6.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./lib/SafeMathInt.sol";
import "hardhat/console.sol";
import "./Curve.sol";

interface IDebasePolicy {
    function upperDeviationThreshold() external view returns (uint256);

    function lowerDeviationThreshold() external view returns (uint256);

    function priceTargetRate() external view returns (uint256);
}

interface IOracle {
    function getData() external returns (uint256, bool);

    function lastPrice() external view returns (uint256);
}

contract BurnPool is Ownable, Curve, Initializable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using SafeMathInt for int256;

    event LogStartNewDistributionCycle(
        uint256 poolShareAdded_,
        uint256 rewardRate_
    );

    event LogSetOracle(IOracle oracle_);
    event LogSetBlockDuration(uint256 blockDuration_);
    event LogSetMultiSigRewardShare(uint256 multiSigRewardShare_);
    event LogSetInitialRewardShare(uint256 initialRewardShare_);
    event LogSetMultiSigAddress(address multiSigAddress_);
    event LogSetOraclePeriod(uint256 oraclePeriod_);
    event LogSetEpochs(uint256 epochs_);
    event LogSetCurveShifter(uint256 curveShifter_);
    event LogSetMeanAndDeviationWithFormulaConstants(
        bytes16 mean_,
        bytes16 deviation_,
        bytes16 oneDivDeviationSqrtTwoPi_,
        bytes16 twoDeviationSquare_
    );
    event LogEmergencyWithdrawa(uint256 withdrawAmount_);
    event LogRewardsAccrued(uint256 rewardsAccrued_);
    event LogRewardClaimed(
        address user,
        uint256 cycleIndex,
        uint256 rewardClaimed_
    );
    event LogNewCouponCycle(
        uint256 index,
        uint256 epochsToReward,
        uint256 rewardAmount,
        uint256 epochsRewarded,
        uint256 couponsIssued,
        uint256 rewardRate,
        uint256 periodFinish,
        uint256 lastUpdateTime,
        uint256 rewardPerTokenStored,
        uint256 couponsPerEpoch,
        uint256 rewardDistributed
    );

    event LogOraclePriceAndPeriod(uint256 price_, uint256 period_);

    IDebasePolicy public policy;
    IERC20 public debase;
    IOracle public oracle;
    address public multiSigAddress;

    address public burnPool1;
    address public burnPool2;

    bytes16 public mean;
    bytes16 public deviation;
    bytes16 public oneDivDeviationSqrtTwoPi;
    bytes16 public twoDeviationSquare;

    uint256 public epochs;
    uint256 public totalRewardsDistributed;

    uint256 public oraclePeriod;
    uint256 public oracleNextUpdate;

    uint256 public rewardsAccrued;
    uint256 public curveShifter;
    uint256 public blockDuration = 10;

    uint256 public initialRewardShare;
    uint256 public multiSigRewardShare;
    uint256 public multiSigRewardToClaimShare;
    bool public positiveToNeutralRebaseRewardsDisabled;

    uint256 internal constant MAX_SUPPLY = ~uint128(0); // (2^128) - 1

    enum Rebase {POSITIVE, NEUTRAL, NEGATIVE, NONE}
    Rebase public lastRebase;

    struct RewardCycle {
        uint256 epochsToReward;
        uint256 rewardShare;
        uint256 epochsRewarded;
        uint256 couponsIssued;
        uint256 rewardRate;
        uint256 periodFinish;
        uint256 lastUpdateTime;
        uint256 rewardPerTokenStored;
        uint256 debasePerEpoch;
        uint256 rewardDistributed;
        mapping(address => uint256) userCouponBalances;
        mapping(address => uint256) userRewardPerTokenPaid;
        mapping(address => uint256) rewards;
    }

    RewardCycle[] public rewardCycles;
    uint256 public rewardCyclesLength;

    modifier updateReward(address account, uint256 index) {
        RewardCycle storage instance = rewardCycles[index];

        instance.rewardPerTokenStored = rewardPerToken(index);
        instance.lastUpdateTime = lastRewardApplicable(index);
        if (account != address(0)) {
            instance.rewards[account] = earned(index);
            instance.userRewardPerTokenPaid[account] = rewardCycles[index]
                .rewardPerTokenStored;
        }
        _;
    }

    function setOraclePeriod(uint256 oraclePeriod_) external onlyOwner {
        oraclePeriod = oraclePeriod_;
        emit LogSetOraclePeriod(oraclePeriod);
    }

    function setCurveShifter(uint256 curveShifter_) external onlyOwner {
        curveShifter = curveShifter_;
        emit LogSetCurveShifter(curveShifter);
    }

    function setEpochs(uint256 epochs_) external onlyOwner {
        epochs = epochs_;
        emit LogSetEpochs(epochs);
    }

    function setOracle(IOracle oracle_) external onlyOwner {
        oracle = oracle_;
        emit LogSetOracle(oracle);
    }

    function setInitialRewardShare(uint256 initialRewardShare_)
        external
        onlyOwner
    {
        initialRewardShare = initialRewardShare_;
        emit LogSetInitialRewardShare(initialRewardShare);
    }

    function setMultiSigRewardShare(uint256 multiSigRewardShare_)
        external
        onlyOwner
    {
        multiSigRewardShare = multiSigRewardShare_;
        emit LogSetMultiSigRewardShare(multiSigRewardShare);
    }

    function setMultiSigAddress(address multiSigAddress_) external onlyOwner {
        multiSigAddress = multiSigAddress_;
        emit LogSetMultiSigAddress(multiSigAddress);
    }

    function setBlockDuration(uint256 blockDuration_) external onlyOwner {
        blockDuration = blockDuration_;
        emit LogSetBlockDuration(blockDuration);
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

        emit LogSetMeanAndDeviationWithFormulaConstants(
            mean,
            deviation,
            oneDivDeviationSqrtTwoPi,
            twoDeviationSquare
        );
    }

    function initialize(
        address debase_,
        IOracle oracle_,
        IDebasePolicy policy_,
        address burnPool1_,
        address burnPool2_,
        uint256 epochs_,
        uint256 oraclePeriod_,
        uint256 curveShifter_,
        uint256 initialRewardShare_,
        address multiSigAddress_,
        uint256 multiSigRewardShare_,
        bytes16 mean_,
        bytes16 deviation_,
        bytes16 oneDivDeviationSqrtTwoPi_,
        bytes16 twoDeviationSquare_
    ) external initializer onlyOwner {
        debase = IERC20(debase_);
        burnPool1 = burnPool1_;
        burnPool2 = burnPool2_;
        policy = policy_;
        oracle = oracle_;

        epochs = epochs_;
        oraclePeriod = oraclePeriod_;
        curveShifter = curveShifter_;
        mean = mean_;
        deviation = deviation_;
        oneDivDeviationSqrtTwoPi = oneDivDeviationSqrtTwoPi_;
        twoDeviationSquare = twoDeviationSquare_;
        initialRewardShare = initialRewardShare_;
        multiSigRewardShare = multiSigRewardShare_;
        multiSigAddress = multiSigAddress_;

        lastRebase = Rebase.NONE;
    }

    function circBalance() public view returns (uint256) {
        uint256 totalSupply = debase.totalSupply();

        return
            totalSupply
                .sub(debase.balanceOf(address(policy)))
                .sub(debase.balanceOf(burnPool1))
                .sub(debase.balanceOf(burnPool2));
    }

    function startNewCouponCycle() internal {
        if (lastRebase != Rebase.NEGATIVE) {
            lastRebase = Rebase.NEGATIVE;

            uint256 rewardAmount;

            if (rewardsAccrued == 0 && rewardCyclesLength == 0) {
                rewardAmount = circBalance().mul(initialRewardShare).div(
                    10**18
                );
            } else {
                rewardAmount = circBalance().mul(rewardsAccrued).div(10**18);
            }

            uint256 rewardShare =
                rewardAmount.mul(10**18).div(debase.totalSupply());

            rewardCycles.push(
                RewardCycle(epochs, rewardShare, 0, 0, 0, 0, 0, 0, 0, 0)
            );

            emit LogNewCouponCycle(
                rewardCyclesLength,
                epochs,
                rewardShare,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0
            );

            rewardCyclesLength = rewardCyclesLength.add(1);
            positiveToNeutralRebaseRewardsDisabled = false;
            rewardsAccrued = 0;

            uint256 price;
            bool valid;

            (price, valid) = oracle.getData();
            require(valid, "Price is invalid");

            oracleNextUpdate = block.number.add(oraclePeriod);
            emit LogOraclePriceAndPeriod(price, oracleNextUpdate);
        }
    }

    function issueRewards(uint256 debasePolicyBalance, bytes16 curveValue)
        internal
        returns (uint256)
    {
        RewardCycle storage instance = rewardCycles[rewardCyclesLength.sub(1)];

        if (instance.debasePerEpoch == 0) {
            instance.debasePerEpoch = instance.rewardShare.div(epochs);
        }

        instance.epochsRewarded = instance.epochsRewarded.add(1);

        uint256 debaseShareToBeRewarded =
            bytes16ToUnit256(curveValue, instance.debasePerEpoch);

        multiSigRewardToClaimShare = debaseShareToBeRewarded
            .mul(multiSigRewardShare)
            .div(10**18);

        uint256 debaseClaimAmount =
            debase.totalSupply().mul(debaseShareToBeRewarded).div(10**18);

        uint256 multiSigRewardToClaimAmount =
            debase.totalSupply().mul(multiSigRewardToClaimShare).div(10**18);

        uint256 totalDebaseToClaim =
            debaseClaimAmount.add(multiSigRewardToClaimAmount);

        if (totalDebaseToClaim <= debasePolicyBalance) {
            startNewDistributionCycle(debaseShareToBeRewarded);
            return totalDebaseToClaim;
        }
        return 0;
    }

    function claimMultiSigReward() external {
        require(
            msg.sender == multiSigAddress,
            "Only multiSigAddress can claim reward"
        );

        uint256 amountToClaim =
            debase.totalSupply().mul(multiSigRewardToClaimShare).div(10**18);
        debase.transfer(multiSigAddress, amountToClaim);
        multiSigRewardToClaimShare = 0;
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
        } else if (supplyDelta_ == 0) {
            if (lastRebase == Rebase.POSITIVE) {
                positiveToNeutralRebaseRewardsDisabled = true;
            }
            lastRebase = Rebase.NEUTRAL;
        } else {
            lastRebase = Rebase.POSITIVE;

            uint256 currentSupply = debase.totalSupply();
            uint256 newSupply = uint256(supplyDelta_.abs()).add(currentSupply);

            if (newSupply > MAX_SUPPLY) {
                newSupply = MAX_SUPPLY;
            }

            uint256 expansionPercentage =
                newSupply.mul(10**18).div(currentSupply).sub(10**18);

            uint256 targetRate =
                policy.priceTargetRate().add(policy.upperDeviationThreshold());

            uint256 offset = exchangeRate_.add(curveShifter).sub(targetRate);

            bytes16 value =
                getCurveValue(
                    offset,
                    mean,
                    oneDivDeviationSqrtTwoPi,
                    twoDeviationSquare
                );

            uint256 expansionPercentageScaled =
                bytes16ToUnit256(value, expansionPercentage);

            if (rewardsAccrued == 0) {
                rewardsAccrued = expansionPercentageScaled;
            } else {
                rewardsAccrued = rewardsAccrued
                    .mul(expansionPercentageScaled)
                    .div(10**18);
            }

            emit LogRewardsAccrued(rewardsAccrued);

            if (
                !positiveToNeutralRebaseRewardsDisabled &&
                rewardCyclesLength != 0 &&
                rewardCycles[rewardCyclesLength.sub(1)].couponsIssued != 0 &&
                rewardCycles[rewardCyclesLength.sub(1)].epochsRewarded < epochs
            ) {
                return issueRewards(debasePolicyBalance, value);
            }
        }

        return 0;
    }

    function checkPriceOrUpdate() internal {
        uint256 lowerPriceThreshold =
            policy.priceTargetRate().sub(policy.lowerDeviationThreshold());

        uint256 price;
        if (block.number > oracleNextUpdate) {
            bool valid;

            (price, valid) = oracle.getData();
            require(valid, "Price is invalid");

            oracleNextUpdate = block.number.add(oraclePeriod);

            emit LogOraclePriceAndPeriod(price, oracleNextUpdate);
        } else {
            price = oracle.lastPrice();
        }
        require(
            price < lowerPriceThreshold,
            "Can only buy coupons if price is lower than lower threshold"
        );
    }

    function buyCoupons(uint256 debaseSent) external {
        require(
            lastRebase == Rebase.NEGATIVE,
            "Can only buy coupons with last rebase was negative"
        );
        checkPriceOrUpdate();

        RewardCycle storage instance = rewardCycles[rewardCyclesLength.sub(1)];

        instance.userCouponBalances[msg.sender] = instance.userCouponBalances[
            msg.sender
        ]
            .add(debaseSent);

        instance.couponsIssued = instance.couponsIssued.add(debaseSent);

        debase.safeTransferFrom(msg.sender, address(policy), debaseSent);
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 withdrawAmount = debase.balanceOf(address(this));
        debase.safeTransfer(address(policy), withdrawAmount);
        emit LogEmergencyWithdrawa(withdrawAmount);
    }

    function lastRewardApplicable(uint256 index)
        internal
        view
        returns (uint256)
    {
        return Math.min(block.timestamp, rewardCycles[index].periodFinish);
    }

    function rewardPerToken(uint256 index) internal view returns (uint256) {
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

    function earned(uint256 index) public view returns (uint256) {
        require(rewardCyclesLength != 0, "Cycle array is empty");
        require(
            index <= rewardCyclesLength.sub(1),
            "Index should not me more than items in the cycle array"
        );

        return
            rewardCycles[index].userCouponBalances[msg.sender]
                .mul(
                rewardPerToken(index).sub(
                    rewardCycles[index].userRewardPerTokenPaid[msg.sender]
                )
            )
                .div(10**18);
    }

    function getReward(uint256 index) public updateReward(msg.sender, index) {
        uint256 reward = earned(index);

        if (reward > 0) {
            RewardCycle storage instance = rewardCycles[index];

            instance.rewards[msg.sender] = 0;

            uint256 rewardToClaim =
                debase.totalSupply().mul(reward).div(10**18);

            instance.rewardDistributed = instance.rewardDistributed.add(reward);
            totalRewardsDistributed = totalRewardsDistributed.add(reward);

            emit LogRewardClaimed(msg.sender, index, rewardToClaim);
            debase.safeTransfer(msg.sender, rewardToClaim);
        }
    }

    function startNewDistributionCycle(uint256 poolTotalShare)
        internal
        updateReward(address(0), rewardCyclesLength.sub(1))
    {
        RewardCycle storage instance = rewardCycles[rewardCyclesLength.sub(1)];

        if (block.number >= instance.periodFinish) {
            instance.rewardRate = poolTotalShare.div(blockDuration);
        } else {
            uint256 remaining = instance.periodFinish.sub(block.number);
            uint256 leftover = remaining.mul(instance.rewardRate);
            instance.rewardRate = poolTotalShare.add(leftover).div(
                blockDuration
            );
        }

        instance.lastUpdateTime = block.number;
        instance.periodFinish = block.number.add(blockDuration);

        emit LogStartNewDistributionCycle(poolTotalShare, instance.rewardRate);
    }
}
