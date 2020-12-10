// SPDX-License-Identifier: MIT
/*
   ____            __   __        __   _
  / __/__ __ ___  / /_ / /  ___  / /_ (_)__ __
 _\ \ / // // _ \/ __// _ \/ -_)/ __// / \ \ /
/___/ \_, //_//_/\__//_//_/\__/ \__//_/ /_\_\
     /___/

* Synthetix: YAMRewards.sol
*
* Docs: https://docs.synthetix.io/
*
*
* MIT License
* ===========
*
* Copyright (c) 2020 Synthetix
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
*/

pragma solidity >=0.6.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

contract LPTokenWrapper {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IERC20 public y;

    function setStakeToken(address _y) internal {
        y = IERC20(_y);
    }

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function stake(uint256 amount) public virtual {
        _totalSupply = _totalSupply.add(amount);
        _balances[msg.sender] = _balances[msg.sender].add(amount);
        y.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount) public virtual {
        _totalSupply = _totalSupply.sub(amount);
        _balances[msg.sender] = _balances[msg.sender].sub(amount);
        y.safeTransfer(msg.sender, amount);
    }
}

contract RandomizedCounter is Ownable, Initializable, LPTokenWrapper {
    using Address for address;

    event LogEmergencyWithdraw(uint256 timestamp);
    event LogSetCountThreshold(uint256 countThreshold_);
    event LogSetBeforePeriodFinish(bool beforePeriodFinish_);
    event LogSetCountInSequence(bool countInSequence_);
    event LogSetRewardAmount(uint256 rewardAmount_);
    event LogSetRevokeReward(bool revokeReward_);
    event LogSetRevokeRewardDuration(uint256 revokeRewardDuration);
    event LogSetNormalDistribution(
        uint256 noramlDistributionMean_,
        uint256 normalDistributionDeviation_,
        uint256[100] normalDistribution_
    );
    event LogCountThreshold(uint256 count_, uint256 index, uint256 threshold_);

    event LogSetDuration(uint256 duration_);
    event LogSetPoolEnabled(bool poolEnabled_);
    event LogCountThresholdHit(
        uint256 rewardAmount_,
        uint256 count_,
        uint256 randomThreshold
    );
    event LogRewardAdded(uint256 reward);
    event LogRewardRevoked(uint256 durationRevoked, uint256 amountRevoked);
    event LogStaked(address indexed user, uint256 amount);
    event LogWithdrawn(address indexed user, uint256 amount);
    event LogRewardPaid(address indexed user, uint256 reward);
    event LogManualPoolStarted(uint256 startedAt);

    IERC20 public rewardToken;
    string public poolName;
    address public policy;
    uint256 public duration;
    bool public poolEnabled;

    uint256 public totalRewards;
    uint256 public rewardAmount;
    uint256 public periodFinish;
    uint256 public rewardRate;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    uint256 public rewardDistributed;

    // Revokes reward until by the duration amount
    uint256 public revokeRewardDuration;

    // Should revoke reward
    bool public revokeReward;

    // The count of s hitting their target
    uint256 public count;

    // Flag to enable or disable   sequence checker
    bool public countInSequence;

    // Flag to send reward before stabilizer pool period time finished
    bool public beforePeriodFinish;

    // The mean for the normal distribution added
    uint256 public noramlDistributionMean;

    // The deviation for te normal distribution added
    uint256 public normalDistributionDeviation;

    // The array of normal distribution value data
    uint256[100] public normalDistribution;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    modifier enabled() {
        require(poolEnabled, "Pool isn't enabled");
        _;
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    /**
     * @notice Function to set how much reward the stabilizer will request
     */
    function setRewardAmount(uint256 rewardAmount_) external onlyOwner {
        rewardAmount = rewardAmount_;
        emit LogSetRewardAmount(rewardAmount);
    }

    /**
     * @notice Function to enable or disable count should be in sequence
     */
    function setCountInSequence(bool countInSequence_) external onlyOwner {
        countInSequence = countInSequence_;
        count = 0;
        emit LogSetCountInSequence(!countInSequence);
    }

    /**
     * @notice Function to enable or disable reward revoking
     */
    function setRevokeReward(bool revokeReward_) external onlyOwner {
        revokeReward = revokeReward_;
        emit LogSetRevokeReward(revokeReward);
    }

    /**
     * @notice Function to set how much of the reward duration should be revoked
     */
    function setRevokeRewardDuration(uint256 revokeRewardDuration_)
        external
        onlyOwner
    {
        require(
            revokeRewardDuration < duration,
            "Revoke duration should be less than total duration"
        );
        revokeRewardDuration = revokeRewardDuration_;
        emit LogSetRevokeRewardDuration(revokeRewardDuration);
    }

    /**
     * @notice Function to allow reward distribution before previous rewards have been distributed
     */
    function setBeforePeriodFinish(bool beforePeriodFinish_)
        external
        onlyOwner
    {
        beforePeriodFinish = beforePeriodFinish_;
        emit LogSetBeforePeriodFinish(beforePeriodFinish);
    }

    /**
     * @notice Function to set reward drop period
     */
    function setDuration(uint256 duration_) external onlyOwner {
        require(duration >= 1);
        duration = duration_;
        emit LogSetDuration(duration);
    }

    /**
     * @notice Function enabled or disable pool staking,withdraw
     */
    function setPoolEnabled(bool poolEnabled_) external onlyOwner {
        poolEnabled = poolEnabled_;
        count = 0;
        emit LogSetPoolEnabled(poolEnabled);
    }


    /**
     * @notice Function to set the normal distribution array and its associated mean/deviation
     */
    function setNormalDistribution(
        uint256 normalDistributionMean_,
        uint256 normalDistributionDeviation_,
        uint256[100] calldata normalDistribution_
    ) external onlyOwner {
        noramlDistributionMean = normalDistributionMean_;
        normalDistributionDeviation = normalDistributionDeviation_;
        normalDistribution = normalDistribution_;
        emit LogSetNormalDistribution(
            noramlDistributionMean,
            normalDistributionDeviation,
            normalDistribution
        );
    }

    function initialize(
        string memory poolName_,
        address rewardToken_,
        address pairToken_,
        address policy_,
        uint256 rewardAmount_,
        uint256 duration_
    ) public initializer {
        poolName = poolName_;
        setStakeToken(pairToken_);
        rewardToken = IERC20(rewardToken_);
        policy = policy_;
        duration = duration_;
        poolEnabled = false;

        rewardAmount = rewardAmount_;
        count = 0;
        countInSequence = true;
        revokeReward = false;
        beforePeriodFinish = false;
        normalDistribution = [15, 10, 10, 11, 11, 9, 10, 10, 10, 10, 11, 11, 9, 10, 8, 7, 9, 9, 8, 11, 8, 11, 8, 12, 11, 13, 8, 10, 9, 7, 8, 9, 11, 11, 10, 9, 10, 9, 11, 9, 9, 14, 12, 8, 6, 14, 9, 11, 9, 13, 10, 11, 13, 13, 6, 9, 7, 11, 10, 8, 10, 10, 7, 9, 12, 10, 11, 9, 13, 12, 9, 9, 12, 9, 9, 11, 10, 9, 8, 12, 12, 8, 10, 10, 14, 11, 12, 10, 11, 8, 7, 11, 10, 11, 8, 7, 11, 8, 9, 6];
        noramlDistributionMean = 10;
        normalDistributionDeviation = 2;
    }

    /**
     * @notice When a rebase happens this function is called by the rebase function. If the supplyDelta is positive (supply increase) a random
     * will be constructed using the blockhash of the last block number. The mod of the random number is taken to get a number between 0-100. This result
     * is used as a index to get a number from the normal distribution array. The number returned will be compared against the current count of
     * positive rebases and if the count is greater then the pool is request rewards from the stabilizer pool.
     */
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

        if (supplyDelta_ > 0) {
            count = count.add(1);

            uint256 randomThreshold = getOnChainRandomThreshold();

            console.log("Threshold hit",count,randomThreshold); 
            if (count >= randomThreshold) {
                count = 0;

                // Rewards given when stabilizer fund balance is greater than requested amount by the pool and if rewards should be given
                // before or after previous distribution period has finished.
                if (
                    debasePolicyBalance >= rewardAmount &&
                    (beforePeriodFinish || block.timestamp >= periodFinish)
                ) {

                    totalRewards = totalRewards.add(rewardAmount);
                    notifyRewardAmount(rewardAmount);

                    emit LogCountThresholdHit(
                        rewardAmount,
                        count,
                        randomThreshold
                    );
                    return rewardAmount;
                }
            }
        } else if (countInSequence) {
            count = 0;
            if (revokeReward && block.timestamp < periodFinish) {
                uint256 timeRemaining = periodFinish.sub(block.timestamp);
                // Rewards will only be revoked from period after the current period so unclaimed rewards arent taken away.
                if (timeRemaining >= revokeRewardDuration) {
                    //Set reward distribution period back
                    periodFinish = periodFinish.sub(revokeRewardDuration);
                    //Calculate reward to rewark by amount the reward moved back
                    uint256 rewardToRevoke = rewardRate.mul(
                        revokeRewardDuration
                    );
                    lastUpdateTime = block.timestamp;
                    if (totalRewards >= rewardToRevoke) {
                        totalRewards = totalRewards.sub(rewardToRevoke);
                    } else {
                        rewardToRevoke = totalRewards;
                        totalRewards = totalRewards.sub(totalRewards);
                    }
                    rewardToken.safeTransfer(policy, rewardToRevoke);
                    emit LogRewardRevoked(revokeRewardDuration, rewardToRevoke);
                }
            }
        }
        return 0;
    }

    /**
     * @notice Function that generates a random number uses that for normal array index
     */
    function getOnChainRandomThreshold() view internal returns (uint256) {
        uint256 randomNumber = normalDistribution[uint256(blockhash(block.number)).mod(100)];
        return randomNumber;
    }

    /**
     * @notice Function allows for emergency withdrawal of all reward tokens back into stabilizer fund
     */
    function emergencyWithdraw() external onlyOwner {
        rewardToken.safeTransfer(policy,rewardToken.balanceOf(address(this)));
        emit LogEmergencyWithdraw(block.timestamp);
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return Math.min(block.timestamp, periodFinish);
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalSupply() == 0) {
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored.add(
                lastTimeRewardApplicable()
                    .sub(lastUpdateTime)
                    .mul(rewardRate)
                    .mul(10**18)
                    .div(totalSupply())
            );
    }

    function earned(address account) public view returns (uint256) {
        return
            balanceOf(account)
                .mul(rewardPerToken().sub(userRewardPerTokenPaid[account]))
                .div(10**18)
                .add(rewards[account]);
    }

    // stake visibility is public as overriding LPTokenWrapper's stake() function
    function stake(uint256 amount)
        public
        override
        updateReward(msg.sender)
        enabled
    {
        require(
            !address(msg.sender).isContract(),
            "Caller must not be a contract"
        );
        require(amount > 0, "Cannot stake 0");
        super.stake(amount);
        emit LogStaked(msg.sender, amount);
    }

    function withdraw(uint256 amount)
        public
        override
        updateReward(msg.sender)
    {
        require(amount > 0, "Cannot withdraw 0");
        super.withdraw(amount);
        emit LogWithdrawn(msg.sender, amount);
    }

    function exit() external {
        withdraw(balanceOf(msg.sender));
        getReward();
    }

    function getReward() public updateReward(msg.sender) enabled {
        uint256 reward = earned(msg.sender);
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardToken.safeTransfer(msg.sender, reward);
            emit LogRewardPaid(msg.sender, reward);
            rewardDistributed = rewardDistributed.add(reward);
        }
    }

    function notifyRewardAmount(uint256 reward)
        internal
        updateReward(address(0))
    {
        if (block.timestamp >= periodFinish) {
            rewardRate = reward.div(duration);
        } else {
            uint256 remaining = periodFinish.sub(block.timestamp);
            uint256 leftover = remaining.mul(rewardRate);
            rewardRate = reward.add(leftover).div(duration);
        }
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp.add(duration);
        emit LogRewardAdded(reward);
    }
}
