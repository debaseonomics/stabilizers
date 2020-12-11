// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./lib/SafeMathInt.sol";

contract DebtPool is Ownable, Initializable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using SafeMathInt for int256;

    address public policy;
    IERC20 public debase;
    uint256 public debtBalance;
    string public poolName;
    uint256 public rewardAmount;
    uint256 public duration;

    mapping(address => uint256) userCouponBalances;
    uint256 public couponsIssued;
    uint256 public couponsClaimed;

    function initialize(
        string memory poolName_,
        address debase_,
        address policy_,
        uint256 rewardAmount_,
        uint256 duration_
    ) public initializer {
        poolName = poolName_;
        debase = IERC20(debase_);
        rewardAmount = rewardAmount_;
        duration = duration_;
        policy = policy_;
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

        if (supplyDelta_ < 0) {
            debtBalance = uint256(supplyDelta_.abs());
        } else {
            uint256 poolBalance = debase.balanceOf(address(this));
            if (poolBalance < couponsIssued) {
                return rewardAmount;
            }
        }
        return 0;
    }

    function buyDebt(uint256 amount) external {
        require(debtBalance > 0, "No debt to buy");
        uint256 balanceToTransfer;
        if (amount <= debtBalance) {
            balanceToTransfer = amount;
            debtBalance = debtBalance.sub(amount);
        } else {
            balanceToTransfer = debtBalance;
            debtBalance = debtBalance.sub(debtBalance);
        }
        userCouponBalances[msg.sender] = balanceToTransfer;
        couponsIssued = couponsIssued.add(balanceToTransfer);
        debase.safeTransfer(address(this), balanceToTransfer);
    }

    function sellCoupons(uint256 amount) external {}
}
