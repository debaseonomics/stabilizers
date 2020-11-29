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

contract StabilizerPool is Ownable, Initializable, LPTokenWrapper {
    using Address for address;

    event LogCountThreshold(uint256 countThreshold_);
    event LogBeforePeriodFinish(bool beforePeriodFinish_);
    event LogCountInSequence(bool countInSequence_);
    event LogRewardAmount(uint256 rewardAmount_);
    event LogRevokeReward(bool revokeReward_);
    event LogRevokeRewardDuration(uint256 revokeRewardDuration_);

    event RewardAdded(uint256 reward);
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event ManualPoolStarted(uint256 startedAt);
    event LogSetDuration(uint256 duration);
    event LogSetPoolEnabled(bool poolEnabled);

    string public poolName;
    IERC20 public rewardToken;
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

    // The threshold count on which to send rewards to the stabilizer pool
    uint256 public countThreshold;

    // Flag to enable or disable   sequence checker
    bool public countInSequence;

    // Flag to send reward before stabilizer pool period time finished
    bool public beforePeriodFinish;

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

    function setRewardAmount(uint256 rewardAmount_) external onlyOwner {
        rewardAmount = rewardAmount_;
        emit LogRewardAmount(rewardAmount);
    }

    /**
     * @notice Function to enable or disable count should be in sequence
     */
    function setCountInSequence(bool countInSequence_) external onlyOwner {
        countInSequence = countInSequence_;
        count = 0;
        emit LogCountInSequence(!countInSequence);
    }

    function setRevokeReward(bool revokeReward_) external onlyOwner {
        revokeReward = revokeReward_;
        emit LogRevokeReward(revokeReward);
    }

    function setRevokeRewardDuration(uint256 revokeRewardDuration_)
        external
        onlyOwner
    {
        require(
            revokeRewardDuration < duration,
            "Revoke duration should be less than total duration"
        );
        revokeRewardDuration = revokeRewardDuration_;
    }

    /**
     * @notice Function to set the count threshold
     * @param countThreshold_ The new threshold
     */
    function setCountThreshold(uint256 countThreshold_) external onlyOwner {
        require(countThreshold_ >= 1);
        countThreshold = countThreshold_;
        count = 0;
        emit LogCountThreshold(countThreshold);
    }

    /**
     * @notice Function to allow reward distribution before previous rewards have been distributed
     * @param beforePeriodFinish_ Flag to toggle distribution
     */
    function setBeforePeriodFinish(bool beforePeriodFinish_)
        external
        onlyOwner
    {
        beforePeriodFinish = beforePeriodFinish_;
        emit LogBeforePeriodFinish(beforePeriodFinish);
    }

    /**
     * @notice Function to set reward drop period
     * @param duration_ New drop duration
     */
    function setDuration(uint256 duration_) external onlyOwner {
        require(duration >= 1);
        duration = duration_;
        emit LogSetDuration(duration);
    }

    /**
     * @notice Function enabled or disable pool staking,withdraw
     * @param poolEnabled_ Flag to toggle pool
     */
    function setPoolEnabled(bool poolEnabled_) external onlyOwner {
        poolEnabled = poolEnabled_;
        count = 0;
        emit LogSetPoolEnabled(poolEnabled);
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
        countThreshold = 20;
        countInSequence = true;
        beforePeriodFinish = false;
    }

    /**
     * @notice Upon succesive succesful s ( exchange price in target price ) the  count will increase. As the count increases if it
     * meets the set threshold. Then a precentage of debase tokens assigned to the policy contract will be transfered to the stabilizer pool.
     * With the added condition that the stabilizer pool has completed it's distribution period or a new flag is set to ovverride the time period.
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

            if (count >= countThreshold) {
                count = 0;
                if (
                    debasePolicyBalance >= rewardAmount &&
                    (beforePeriodFinish || now >= periodFinish)
                ) {
                    notifyRewardAmount(rewardAmount);
                    return rewardAmount;
                }
            }
        } else if (countInSequence && count != 0) {
            count = 0;
        }
        if (revokeReward && block.timestamp < periodFinish) {
            uint256 timeRemaining = block.timestamp.sub(periodFinish);
            if (timeRemaining >= revokeRewardDuration) {
                periodFinish = periodFinish.sub(revokeRewardDuration);
                rewardToken.safeTransfer(
                    policy,
                    rewardRate.mul(revokeRewardDuration)
                );
            }
        }
        return 0;
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
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount)
        public
        override
        updateReward(msg.sender)
        enabled
    {
        require(amount > 0, "Cannot withdraw 0");
        super.withdraw(amount);
        emit Withdrawn(msg.sender, amount);
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
            emit RewardPaid(msg.sender, reward);
            rewardDistributed = rewardDistributed.add(reward);
        }
    }

    function notifyRewardAmount(uint256 reward)
        internal
        updateReward(address(0))
    {
        uint256 remaining = periodFinish.sub(block.timestamp);
        uint256 leftover = remaining.mul(rewardRate);
        rewardRate = reward.add(leftover).div(duration);
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp.add(duration);
        emit RewardAdded(reward);
    }
}
