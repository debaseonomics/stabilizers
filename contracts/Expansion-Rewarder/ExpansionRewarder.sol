// SPDX-License-Identifier: MIT
/*

██████╗ ███████╗██████╗  █████╗ ███████╗███████╗
██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝██╔════╝
██║  ██║█████╗  ██████╔╝███████║███████╗█████╗  
██║  ██║██╔══╝  ██╔══██╗██╔══██║╚════██║██╔══╝  
██████╔╝███████╗██████╔╝██║  ██║███████║███████╗
╚═════╝ ╚══════╝╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝
                                               

* Debase: ExpansionRewarder.sol
* Description:
* Pool that pool the issues rewards on expansions of debase supply
* Coded by: punkUnknown
*/

pragma solidity >=0.6.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
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

contract ExpansionRewarder is Ownable, LPTokenWrapper, ReentrancyGuard {
    using Address for address;

    event LogEmergencyWithdraw(uint256 number);
    event LogSetRewardPercentage(uint256 rewardPercentage_);
    event LogSetBlockDuration(uint256 duration_);
    event LogSetPoolEnabled(bool poolEnabled_);
    event LogStartNewDistribtionCycle(
        uint256 poolShareAdded_,
        uint256 amount_,
        uint256 rewardRate_,
        uint256 periodFinish_
    );

    event LogSetEnableUserLpLimit(bool enableUserLpLimit_);
    event LogSetEnablePoolLpLimit(bool enablePoolLpLimit_);
    event LogSetUserLpLimit(uint256 userLpLimit_);
    event LogSetPoolLpLimit(uint256 poolLpLimit_);

    event LogRewardAdded(uint256 reward);
    event LogStaked(address indexed user, uint256 amount);
    event LogWithdrawn(address indexed user, uint256 amount);
    event LogRewardPaid(address indexed user, uint256 reward);

    IERC20 public debase;
    address public policy;
    uint256 public blockDuration;
    bool public poolEnabled;

    uint256 public periodFinish;
    uint256 public periodLeft;
    uint256 public rewardRate;
    uint256 public lastUpdateBlock;
    uint256 public rewardPerTokenStored;
    uint256 public rewardPercentage;
    uint256 public rewardDistributed;

    //Flag to enable amount of lp that can be staked by a account
    bool public enableUserLpLimit;
    //Amount of lp that can be staked by a account
    uint256 public userLpLimit;

    //Flag to enable total amount of lp that can be staked by all users
    bool public enablePoolLpLimit;
    //Total amount of lp tat can be staked
    uint256 public poolLpLimit;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    modifier enabled() {
        require(poolEnabled, "Pool isn't enabled");
        _;
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateBlock = lastBlockRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    /**
     * @notice Function to set how much reward the stabilizer will request
     */
    function setRewardPercentage(uint256 rewardPercentage_) external onlyOwner {
        rewardPercentage = rewardPercentage_;
        emit LogSetRewardPercentage(rewardPercentage);
    }

    /**
     * @notice Function to set reward drop period
     */
    function setblockDuration(uint256 blockDuration_) external onlyOwner {
        require(blockDuration >= 1);
        blockDuration = blockDuration_;
        emit LogSetBlockDuration(blockDuration);
    }

    /**
     * @notice Function enabled or disable pool staking,withdraw
     */
    function setPoolEnabled(bool poolEnabled_) external onlyOwner {
        poolEnabled = poolEnabled_;
        emit LogSetPoolEnabled(poolEnabled);
    }

    /**
     * @notice Function to enable user lp limit
     */
    function setEnableUserLpLimit(bool enableUserLpLimit_) external onlyOwner {
        enableUserLpLimit = enableUserLpLimit_;
        emit LogSetEnableUserLpLimit(enableUserLpLimit);
    }

    /**
     * @notice Function to set user lp limit
     */
    function setUserLpLimit(uint256 userLpLimit_) external onlyOwner {
        require(
            userLpLimit_ <= poolLpLimit,
            "User lp limit cant be more than pool limit"
        );
        userLpLimit = userLpLimit_;
        emit LogSetUserLpLimit(userLpLimit);
    }

    /**
     * @notice Function to enable pool lp limit
     */
    function setEnablePoolLpLimit(bool enablePoolLpLimit_) external onlyOwner {
        enablePoolLpLimit = enablePoolLpLimit_;
        emit LogSetEnablePoolLpLimit(enablePoolLpLimit);
    }

    /**
     * @notice Function to set pool lp limit
     */
    function setPoolLpLimit(uint256 poolLpLimit_) external onlyOwner {
        require(
            poolLpLimit_ >= userLpLimit,
            "Pool lp limit cant be less than user lp limit"
        );
        poolLpLimit = poolLpLimit_;
        emit LogSetPoolLpLimit(poolLpLimit);
    }

    constructor(
        address debase_,
        address pairToken_,
        address policy_,
        uint256 rewardPercentage_,
        uint256 blockDuration_,
        bool enableUserLpLimit_,
        uint256 userLpLimit_,
        bool enablePoolLpLimit_,
        uint256 poolLpLimit_
    ) public {
        setStakeToken(pairToken_);
        debase = IERC20(debase_);
        policy = policy_;

        blockDuration = blockDuration_;
        rewardPercentage = rewardPercentage_;

        userLpLimit = userLpLimit_;
        enableUserLpLimit = enableUserLpLimit_;
        poolLpLimit = poolLpLimit_;
        enablePoolLpLimit = enablePoolLpLimit_;
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

        if (supplyDelta_ >= 0) {
            if (periodLeft != 0) {
                periodFinish = block.number.add(periodLeft);
                periodLeft = 0;
            } else if (rewardPercentage != 0) {
                uint256 rewardToClaim =
                    debasePolicyBalance.mul(rewardPercentage).div(10**18);

                if (debasePolicyBalance >= rewardToClaim) {
                    rewardPercentage = 0;
                    startNewDistribtionCycle(rewardToClaim);
                    return rewardToClaim;
                }
            }
        } else if (block.number < periodFinish) {
            periodLeft = periodFinish.sub(block.number);
            periodFinish = block.number;
        }
        return 0;
    }

    /**
     * @notice Function allows for emergency withdrawal of all reward tokens back into stabilizer fund
     */
    function emergencyWithdraw() external onlyOwner {
        debase.safeTransfer(policy, debase.balanceOf(address(this)));
        emit LogEmergencyWithdraw(block.number);
    }

    function lastBlockRewardApplicable() internal view returns (uint256) {
        return Math.min(block.number, periodFinish);
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalSupply() == 0) {
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored.add(
                lastBlockRewardApplicable()
                    .sub(lastUpdateBlock)
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
        nonReentrant
        updateReward(msg.sender)
        enabled
    {
        require(
            !address(msg.sender).isContract(),
            "Caller must not be a contract"
        );
        require(amount > 0, "Cannot stake 0");

        if (enablePoolLpLimit) {
            uint256 lpBalance = totalSupply();
            require(
                amount.add(lpBalance) <= poolLpLimit,
                "Cant stake pool lp limit reached"
            );
        }
        if (enableUserLpLimit) {
            uint256 userLpBalance = balanceOf(msg.sender);
            require(
                userLpBalance.add(amount) <= userLpLimit,
                "Cant stake more than lp limit"
            );
        }

        super.stake(amount);
        emit LogStaked(msg.sender, amount);
    }

    function withdraw(uint256 amount)
        public
        override
        nonReentrant
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

    function getReward() public nonReentrant updateReward(msg.sender) enabled {
        uint256 reward = earned(msg.sender);
        if (reward > 0) {
            rewards[msg.sender] = 0;

            uint256 rewardToClaim =
                debase.totalSupply().mul(reward).div(10**18);

            debase.safeTransfer(msg.sender, rewardToClaim);

            emit LogRewardPaid(msg.sender, rewardToClaim);
            rewardDistributed = rewardDistributed.add(reward);
        }
    }

    function startNewDistribtionCycle(uint256 amount)
        internal
        updateReward(address(0))
    {
        // https://sips.synthetix.io/sips/sip-77
        uint256 totalBalance = amount.add(debase.balanceOf(address(this)));
        require(
            totalBalance < uint256(-1) / 10**18,
            "Rewards: rewards too large, would lock"
        );

        uint256 amountShare = amount.mul(10**18).div(debase.totalSupply());

        if (block.number >= periodFinish) {
            rewardRate = amountShare.div(blockDuration);
        } else {
            uint256 remaining = periodFinish.sub(block.number);
            uint256 leftover = remaining.mul(rewardRate);
            rewardRate = amountShare.add(leftover).div(blockDuration);
        }
        lastUpdateBlock = block.number;
        periodFinish = block.number.add(blockDuration);

        emit LogStartNewDistribtionCycle(
            amountShare,
            amount,
            rewardRate,
            periodFinish
        );
    }
}
