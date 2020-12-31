// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./lib/SafeMathInt.sol";
import "./MintCoupons.sol";

contract BurnPool is MintCoupons {
    using SafeERC20 for IERC20;
    using SafeMathInt for int256;

    address public policy;
    address public stakingPool1;
    address public stakingPool2;
    IERC20 public debase;
    uint256 public debtBalance;

    uint256 public rewardClaimPercentage;

    mapping(address => mapping(uint256 => uint256)) userCouponBalances;
    uint256 public couponsIssued;
    uint256 public couponsClaimed;

    constructor(
        address debase_,
        address policy_,
        address stakingPool1_,
        address stakingPool2_
    ) public {
        debase = IERC20(debase_);
        stakingPool1 = stakingPool1_;
        stakingPool2 = stakingPool2_;
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

        uint256 supplyDeltaUint = uint256(supplyDelta_.abs());
        uint256 currentSupply = debase.totalSupply();
        uint256 newSupply;

        if (supplyDelta_ < 0) {
            newSupply = currentSupply.sub(supplyDeltaUint);
        } else {
            newSupply = currentSupply.add(supplyDeltaUint);
        }

        uint256 circBalance =
            currentSupply.sub(debase.balanceOf(stakingPool1)).sub(
                debase.balanceOf(stakingPool2)
            );

        uint256 circBalanceShare = circBalance.div(currentSupply);
        uint256 newcircBalance = newSupply.mul(circBalanceShare);

        if (supplyDelta_ < 0) {
            debtBalance.add(circBalanceShare.sub(newcircBalance));
        } else {
            uint256 debtToReduce = newcircBalance.sub(circBalanceShare);

            if (debtToReduce > debtBalance) {
                debtBalance.sub(debtBalance);
            } else {
                debtBalance.sub(newcircBalance.sub(circBalanceShare));
            }
            uint256 currentBalance = debase.balanceOf(address(this));
            uint256 currentBalanceShare = currentBalance.div(currentSupply);
            uint256 newBalance = newSupply.mul(currentBalanceShare);

            if (newBalance <= couponsIssued) {
                uint256 debaseToIssue = couponsIssued.sub(newBalance);
                return debaseToIssue;
            } else {
                uint256 debaseToReclaim = newBalance.sub(couponsIssued);
                debase.safeTransfer(address(this), debaseToReclaim);
            }
        }

        return 0;
    }

    function buyDebt(uint256 debtAmountToBuy) external {
        require(debtBalance > 0, "No debt to buy");
        require(
            debtAmountToBuy <= debtBalance,
            "Cant buy more debt than it avaiable"
        );

        uint256 currentSupply = debase.totalSupply();
        uint256 circBalance =
            currentSupply.sub(debase.balanceOf(stakingPool1)).sub(
                debase.balanceOf(stakingPool2)
            );

        uint256 couponsBought =
            calculateCouponPremium(circBalance, debtBalance, debtAmountToBuy);

        userCouponBalances[msg.sender][negativeRebaseEpoch] = couponsBought;
        couponsIssued = couponsIssued.add(couponsBought);

        debtBalance = debtBalance.sub(debtAmountToBuy);

        debase.safeTransfer(address(this), debtAmountToBuy);
    }

    function sellCoupons(uint256 couponsAmountToSell) external {
        require(couponsIssued > 0, "No coupons to sell");
    }
}
