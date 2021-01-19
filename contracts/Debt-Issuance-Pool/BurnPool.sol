// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./lib/SafeMathInt.sol";
import "./Curve.sol";

interface IDebasePolicy {
    function minRebaseTimeIntervalSec() external view returns (uint256);

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
        uint256 rewardAmount_,
        uint256 poolShareAdded_,
        uint256 rewardRate_,
        uint256 periodFinish_
    );

    event LogSetOracle(IOracle oracle_);
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
    event LogRewardsAccured(uint256 rewardsAccured_);
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

    uint256 public rewardsAccured;
    uint256 public curveShifter;

    uint256 public initialRewardShare;
    uint256 public multiSigRewardShare;
    uint256 public multiSigRewardToClaimShare;

    uint256 internal constant MAX_SUPPLY = ~uint128(0); // (2^128) - 1

    enum Rebase {POSITIVE, NETURAL, NEGATIVE, NONE}
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

    function mulDiv(
        uint256 x,
        uint256 y,
        uint256 z
    ) internal pure returns (uint256) {
        uint256 a = x.div(z);
        uint256 b = x.mod(z); // x = a * z + b
        uint256 c = y.div(z);
        uint256 d = y.mod(z); // y = c * z + d

        uint256 res1 = a.mul(b).mul(z).add(a).mul(d);
        uint256 res2 = b.mul(c).add(b.mul(d)).div(z);

        return res1.add(res2);
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

    function circBalance() internal view returns (uint256) {
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

            if (rewardsAccured == 0 && rewardCycles.length == 0) {
                rewardAmount = mulDiv(
                    circBalance(),
                    initialRewardShare,
                    10**18
                );
            } else {
                rewardAmount = mulDiv(circBalance(), rewardsAccured, 10**18);
            }

            uint256 rewardShare =
                mulDiv(rewardAmount, 10**18, debase.totalSupply());

            rewardCycles.push(
                RewardCycle(epochs, rewardShare, 0, 0, 0, 0, 0, 0, 0, 0)
            );

            emit LogNewCouponCycle(
                rewardCycles.length.sub(1),
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

            rewardsAccured = 0;

            uint256 price;
            bool valid;

            (price, valid) = oracle.getData();
            require(valid);

            oracleNextUpdate = block.timestamp.add(oraclePeriod);
            emit LogOraclePriceAndPeriod(price, oracleNextUpdate);
        }
    }

    function issueRewards(uint256 debasePolicyBalance, bytes16 curveValue)
        internal
        returns (uint256)
    {
        RewardCycle storage instance = rewardCycles[rewardCycles.length.sub(1)];

        if (lastRebase != Rebase.POSITIVE) {
            lastRebase = Rebase.POSITIVE;
            instance.debasePerEpoch = instance.rewardShare.div(epochs);
        }

        instance.epochsRewarded = instance.epochsRewarded.add(1);

        uint256 debaseToBeRewarded =
            bytes16ToUnit256(curveValue, instance.debasePerEpoch);

        uint256 multiSigRewardToClaimAmount =
            mulDiv(debaseToBeRewarded, multiSigRewardShare, 10**18);

        multiSigRewardToClaimShare = mulDiv(
            multiSigRewardToClaimAmount,
            10**18,
            debase.totalSupply()
        );

        if (debaseToBeRewarded <= debasePolicyBalance) {
            startNewDistributionCycle(debaseToBeRewarded);
            return debaseToBeRewarded.add(multiSigRewardToClaimAmount);
        }
        return 0;
    }

    function claimMultiSigReward() external {
        require(msg.sender == multiSigAddress);

        uint256 amountToClaim =
            mulDiv(debase.totalSupply(), multiSigRewardToClaimShare, 10**18);
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

        if (supplyDelta_ <= 0) {
            startNewCouponCycle();
        } else if (supplyDelta_ == 0) {
            lastRebase = Rebase.NETURAL;
        } else {
            uint256 length = rewardCycles.length;

            uint256 currentSupply = debase.totalSupply();
            uint256 newSupply = uint256(supplyDelta_.abs()).add(currentSupply);

            if (newSupply > MAX_SUPPLY) {
                newSupply = MAX_SUPPLY;
            }

            uint256 expansionPercentage =
                mulDiv(newSupply, 10**18, currentSupply);

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

            rewardsAccured = mulDiv(
                rewardsAccured,
                expansionPercentageScaled,
                10**18
            );

            emit LogRewardsAccured(rewardsAccured);

            if (
                lastRebase != Rebase.NETURAL &&
                length != 0 &&
                rewardCycles[length.sub(1)].couponsIssued != 0 &&
                rewardCycles[length.sub(1)].epochsRewarded < epochs
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
        if (block.timestamp > oracleNextUpdate) {
            bool valid;

            (price, valid) = oracle.getData();
            require(valid);

            oracleNextUpdate = block.timestamp.add(oraclePeriod);

            emit LogOraclePriceAndPeriod(price, oracleNextUpdate);
        } else {
            price = oracle.lastPrice();
        }
        require(price < lowerPriceThreshold);
    }

    function buyDebt(uint256 debaseSent) external {
        require(lastRebase == Rebase.NEGATIVE);
        checkPriceOrUpdate();

        RewardCycle storage instance = rewardCycles[rewardCycles.length.sub(1)];

        instance.userCouponBalances[msg.sender] = instance.userCouponBalances[
            msg.sender
        ]
            .add(debaseSent);

        instance.couponsIssued = instance.couponsIssued.add(debaseSent);

        debase.transfer(address(this), debaseSent);
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

    function earned(address account, uint256 index)
        public
        view
        returns (uint256)
    {
        uint256 length = rewardCycles.length;
        require(length != 0, "Cycle array is empty");
        require(
            index <= length.sub(1),
            "Index should not me more than items in the cycle array"
        );

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
                mulDiv(debase.totalSupply(), reward, 10**18);

            instance.rewardDistributed = instance.rewardDistributed.add(reward);
            totalRewardsDistributed = totalRewardsDistributed.add(reward);

            emit LogRewardClaimed(msg.sender, index, rewardToClaim);
            debase.safeTransfer(msg.sender, rewardToClaim);
        }
    }

    function startNewDistributionCycle(uint256 amount)
        internal
        updateReward(address(0), rewardCycles.length.sub(1))
    {
        RewardCycle storage instance = rewardCycles[rewardCycles.length.sub(1)];

        uint256 poolTotalShare = mulDiv(amount, 10**18, debase.totalSupply());
        uint256 duration = policy.minRebaseTimeIntervalSec();

        instance.rewardRate = poolTotalShare.div(duration);
        instance.lastUpdateTime = block.timestamp;
        instance.periodFinish = block.timestamp.add(duration);

        emit LogStartNewDistributionCycle(
            amount,
            poolTotalShare,
            instance.rewardRate,
            instance.periodFinish
        );
    }
}
