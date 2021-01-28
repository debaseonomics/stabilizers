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

    event LogTotalRewardClaimed(uint256 totalRewardClaimed_);
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
    uint256 internal constant MAX_SUPPLY = ~uint128(0); // (2^128) - 1

    // Address of the debase policy/reward contract
    IDebasePolicy public policy;
    // Address of the debase token
    IERC20 public debase;
    // Address of the oracle contract managing opening and closing of coupon buying
    IOracle public oracle;
    // Address of the multiSig treasury
    address public multiSigAddress;

    // Address of dai staking pool with burned tokens
    address public burnPool1;
    // Address of debase/dai staking pool with burned tokens
    address public burnPool2;

    // Mean for log normal distribution
    bytes16 public mean;
    // Deviation for log normal distribution
    bytes16 public deviation;
    // Result of 1/(Deviation*Sqrt(2*pi)) for optimized log normal calculation
    bytes16 public oneDivDeviationSqrtTwoPi;
    // Result of 2*(Deviation)^2 for optimized log normal calculation
    bytes16 public twoDeviationSquare;

    // The number rebases coupon rewards can be distributed for
    uint256 public epochs;
    // The total rewards in %s of the market cap distributed
    uint256 public totalRewardsDistributed;

    // The period after which the oracle price updates for coupon buying
    uint256 public oraclePeriod;
    // The block number when the oracle with update next
    uint256 public oracleNextUpdate;

    // Tracking supply expansion in relation to total supply.
    // To be given out as rewards after the next contraction
    uint256 public rewardsAccrued;
    // Offset to shift the log normal curve
    uint256 public curveShifter;
    // The  block duration over which rewards are given out
    uint256 public blockDuration = 100;

    // The percentage of the total supply to be given out on the first instance
    // when the pool launches and the next rebase is negative
    uint256 public initialRewardShare;
    // The percentage of the current reward to be given in an epoch to be routed to the treasury
    uint256 public multiSigRewardShare;
    // The percentage of the total supply that can be claimed as rewards for the treasury
    uint256 public multiSigRewardToClaimShare;
    // Flag to stop rewards to be given out if rebases go from positive to neutral
    bool public positiveToNeutralRebaseRewardsDisabled;

    enum Rebase {POSITIVE, NEUTRAL, NEGATIVE, NONE}
    // Showing last rebase that happened
    Rebase public lastRebase;

    // Struct saving the data related rebase cycles
    struct RewardCycle {
        // Shows the number of epoch(rebases) to distribute rewards for
        uint256 epochsToReward;
        // Shows the %s of the totalSupply to be given as reward
        uint256 rewardShare;
        // Shows the number of epochs(rebases) rewarded
        uint256 epochsRewarded;
        // The number if coupouns issued/Debase sold in the contraction cycle
        uint256 couponsIssued;
        // The reward Rate for the distribution cycle
        uint256 rewardRate;
        // The period over to distribute rewards for a single epoch/cycle
        uint256 periodFinish;
        uint256 lastUpdateTime;
        uint256 rewardPerTokenStored;
        // The debase to be rewarded as per the epoch
        uint256 debasePerEpoch;
        // The rewards distributed in %s of the total supply in reward cycle
        uint256 rewardDistributed;
        mapping(address => uint256) userCouponBalances;
        mapping(address => uint256) userRewardPerTokenPaid;
        mapping(address => uint256) rewards;
    }

    // Array of rebase cycles
    RewardCycle[] public rewardCycles;
    // Lenght of the rebase cycles
    uint256 public rewardCyclesLength;

    modifier updateReward(address account, uint256 index) {
        require(rewardCyclesLength != 0, "Cycle array is empty");
        require(
            index <= rewardCyclesLength.sub(1),
            "Index should not me more than items in the cycle array"
        );

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

    /**
     * @notice Function to set the oracle period after which the price updates
     * @param oraclePeriod_ New oracle period
     */
    function setOraclePeriod(uint256 oraclePeriod_) external onlyOwner {
        oraclePeriod = oraclePeriod_;
        emit LogSetOraclePeriod(oraclePeriod);
    }

    /**
     * @notice Function to set the offest by which to shift the log normal curve
     * @param curveShifter_ New curve offset
     */
    function setCurveShifter(uint256 curveShifter_) external onlyOwner {
        curveShifter = curveShifter_;
        emit LogSetCurveShifter(curveShifter);
    }

    /**
     * @notice Function to set the number of epochs/rebase triggers over which to distribute rewards
     * @param epochs_ New rewards epoch
     */
    function setEpochs(uint256 epochs_) external onlyOwner {
        epochs = epochs_;
        emit LogSetEpochs(epochs);
    }

    /**
     * @notice Function to set the oracle address for the coupon buying and closing
     * @param oracle_ Address of the new oracle
     */
    function setOracle(IOracle oracle_) external onlyOwner {
        oracle = oracle_;
        emit LogSetOracle(oracle);
    }

    /**
     * @notice Function to set the initial reward if the pools first rebase is negative
     * @param initialRewardShare_ New initial reward share in %s
     */
    function setInitialRewardShare(uint256 initialRewardShare_)
        external
        onlyOwner
    {
        initialRewardShare = initialRewardShare_;
        emit LogSetInitialRewardShare(initialRewardShare);
    }

    /**
     * @notice Function to set the share of the epoch reward to be given out to treasury
     * @param multiSigRewardShare_ New multiSig reward share in 5s
     */
    function setMultiSigRewardShare(uint256 multiSigRewardShare_)
        external
        onlyOwner
    {
        multiSigRewardShare = multiSigRewardShare_;
        emit LogSetMultiSigRewardShare(multiSigRewardShare);
    }

    /**
     * @notice Function to set the multiSig treasury address to get treasury rewards
     * @param multiSigAddress_ New multi sig treasury address
     */
    function setMultiSigAddress(address multiSigAddress_) external onlyOwner {
        multiSigAddress = multiSigAddress_;
        emit LogSetMultiSigAddress(multiSigAddress);
    }

    /**
     * @notice Function to set the reward duration for a single epoch reward period
     * @param blockDuration_ New block duration period
     */
    function setBlockDuration(uint256 blockDuration_) external onlyOwner {
        blockDuration = blockDuration_;
        emit LogSetBlockDuration(blockDuration);
    }

    /**
     * @notice Function to set the mean,deviation and formula constants for log normals curve
     * @param mean_ New log normal mean
     * @param deviation_ New log normal deviation
     * @param oneDivDeviationSqrtTwoPi_ New Result of 1/(Deviation*Sqrt(2*pi))
     * @param twoDeviationSquare_ New Result of 2*(Deviation)^2
     */
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

    /**
     * @notice Function that initializes set of variables for the pool on launch
     */
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

    /**
     * @notice Function that shows the current circulating balance
     * @return Returns circulating balance
     */
    function circBalance() public view returns (uint256) {
        uint256 totalSupply = debase.totalSupply();

        return
            totalSupply
                .sub(debase.balanceOf(address(policy)))
                .sub(debase.balanceOf(burnPool1))
                .sub(debase.balanceOf(burnPool2));
    }

    /**
     * @notice Function that is called when the next rebase is negative. If the last rebase was not negative then a
     * new coupon cycle starts. If the last rebase was also negative when nothing happens.
     */
    function startNewCouponCycle() internal {
        if (lastRebase != Rebase.NEGATIVE) {
            lastRebase = Rebase.NEGATIVE;

            uint256 rewardAmount;

            // For the special case when the pool launches and the next rebase is negative. Meaning no rewards are accured from
            // positive expansion and hence no negaitve reward cycles have started. Then we use our reward as the inital reward
            // setting too bootstrap the pool.
            if (rewardsAccrued == 0 && rewardCyclesLength == 0) {
                // Get reward in relation to circulating balance multiplied by share
                rewardAmount = circBalance().mul(initialRewardShare).div(
                    10**18
                );
            } else {
                rewardAmount = circBalance().mul(rewardsAccrued).div(10**18);
            }

            // Scale reward amount in relation debase total supply
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

            // Get current price for the debase dai pair
            (price, valid) = oracle.getData();
            require(valid, "Price is invalid");

            oracleNextUpdate = block.number.add(oraclePeriod);
            emit LogOraclePriceAndPeriod(price, oracleNextUpdate);
        }
    }

    /**
     * @notice Function that issues rewards when a positive rebase is about to happen.
     * @param debasePolicyBalance The current balance of the fund contract
     * @param curveValue Value of the log normal curve
     * @return Returns amount of rewards to be claimed from a positive rebase
     */
    function issueRewards(uint256 debasePolicyBalance, bytes16 curveValue)
        internal
        returns (uint256)
    {
        RewardCycle storage instance = rewardCycles[rewardCyclesLength.sub(1)];

        // Percentage amount to be claimed per epoch. Only set at the start of first reward epoch.
        // Its the result of reward expansion to give out div by number of epochs to give in
        if (instance.debasePerEpoch == 0) {
            instance.debasePerEpoch = instance.rewardShare.div(epochs);
        }

        instance.epochsRewarded = instance.epochsRewarded.add(1);

        // Scale reward percentage in relation curve value
        uint256 debaseShareToBeRewarded =
            bytes16ToUnit256(curveValue, instance.debasePerEpoch);

        // Claim multi sig reward in relation to scaled debase reward
        multiSigRewardToClaimShare = debaseShareToBeRewarded
            .mul(multiSigRewardShare)
            .div(10**18);

        // Convert reward to token amount
        uint256 debaseClaimAmount =
            debase.totalSupply().mul(debaseShareToBeRewarded).div(10**18);

        // Convert multisig reward to token amount
        uint256 multiSigRewardToClaimAmount =
            debase.totalSupply().mul(multiSigRewardToClaimShare).div(10**18);

        uint256 totalDebaseToClaim =
            debaseClaimAmount.add(multiSigRewardToClaimAmount);

        if (totalDebaseToClaim <= debasePolicyBalance) {
            // Start new reward distribution cycle in relation to just debase claim amount
            startNewDistributionCycle(
                totalDebaseToClaim,
                debaseShareToBeRewarded
            );
            LogTotalRewardClaimed(totalDebaseToClaim);

            return totalDebaseToClaim;
        }
        return 0;
    }

    /**
     * @notice Function called by treasury to claim multi sig reward percentage. Since claims can only happen after the rebase reward
     * contract has rewarded the pool
     */
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

    /**
     * @notice Function called by the reward contract to start new distribution cycles
     * @param supplyDelta_ Supply delta of the rebase to happen
     * @param rebaseLag_ Rebase lag applied to the supply delta
     * @param exchangeRate_ Exchange rate at which the rebase is happening
     * @param debasePolicyBalance Current balance of the policy contract
     * @return Amount of debase to be claimed from the reward contract
     */
    function checkStabilizerAndGetReward(
        int256 supplyDelta_,
        int256 rebaseLag_,
        uint256 exchangeRate_,
        uint256 debasePolicyBalance
    ) external returns (uint256) {
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

            // Get the percentage expansion that will happen from the rebase
            uint256 expansionPercentage =
                newSupply.mul(10**18).div(currentSupply).sub(10**18);

            uint256 targetRate =
                policy.priceTargetRate().add(policy.upperDeviationThreshold());

            // Get the difference between the current price and the target price (1.05$ Dai)
            uint256 offset = exchangeRate_.add(curveShifter).sub(targetRate);

            // Use the offset to get the current curve value
            bytes16 value =
                getCurveValue(
                    offset,
                    mean,
                    oneDivDeviationSqrtTwoPi,
                    twoDeviationSquare
                );

            // Expansion percentage is scaled in relation to the value
            uint256 expansionPercentageScaled =
                bytes16ToUnit256(value, expansionPercentage);

            // On our first positive rebase rewardsAccrued rebase will be the expansion percentage
            if (rewardsAccrued == 0) {
                rewardsAccrued = expansionPercentageScaled;
            } else {
                // Subsequest positive rebases will be compounded with previous rebases
                rewardsAccrued = rewardsAccrued
                    .mul(expansionPercentageScaled)
                    .div(10**18);
            }

            emit LogRewardsAccrued(rewardsAccrued);

            // Rewards will not be issued if
            // 1. We go from neutral to positive and back to neutral rebase
            // 2. If now reward cycle has happened
            // 3. If no coupons bought in the expansion cycle
            // 4. If not all epochs have been rewarded
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

    /**
     * @notice Function that checks the currect price of the coupon oracle. If oracle price period has finished
     * then another oracle update is called.
     */
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

    /**
     * @notice Function that allows users to buy coupuns by send in debase to the contract. When ever coupons are being bought
     * the current we check the TWAP price of the debase pair. If the price is above the lower threshold price (0.95 dai)
     * then no coupons can be bought. If the price is below than coupons can be bought. The debase sent are routed to the
     * reward contract.
     * @param debaseSent Debase amount sent
     */
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
        RewardCycle storage instance = rewardCycles[index];

        return
            instance.userCouponBalances[msg.sender]
                .mul(
                rewardPerToken(index).sub(
                    instance.userRewardPerTokenPaid[msg.sender]
                )
            )
                .div(10**18)
                .add(instance.rewards[msg.sender]);
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

    function startNewDistributionCycle(
        uint256 totalDebaseToClaim,
        uint256 poolTotalShare
    ) internal updateReward(address(0), rewardCyclesLength.sub(1)) {
        RewardCycle storage instance = rewardCycles[rewardCyclesLength.sub(1)];

        // https://sips.synthetix.io/sips/sip-77
        uint256 poolBal =
            totalDebaseToClaim.add(debase.balanceOf(address(this)));
        require(
            poolBal < uint256(-1) / 10**18,
            "Rewards: rewards too large, would lock"
        );

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
