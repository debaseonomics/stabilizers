// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "./lib/SafeMathInt.sol";

contract DebtPool is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using SafeMathInt for int256;

    address public policy;
    address public stakingPool1;
    address public stakingPool2;
    IERC20 public debase;
    uint256 public debtBalance;

    uint256 public rewardClaimPercentage;
    IUniswapV2Pair public debaseDaiUniPair;

    mapping(address => uint256) userCouponBalances;
    uint256 public couponsIssued;
    uint256 public couponsClaimed;

    constructor(
        address debase_,
        address policy_,
        address stakingPool1_,
        address stakingPool2_,
        address debaseDaiUniPair_
    ) public {
        debase = IERC20(debase_);
        stakingPool1 = stakingPool1_;
        stakingPool2 = stakingPool2_;
        policy = policy_;
        debaseDaiUniPair = IUniswapV2Pair(debaseDaiUniPair_);
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
            uint256 supplyDeltaUint = uint256(supplyDelta_.abs());
            uint256 currentSupply = debase.totalSupply();
            uint256 newSupply = currentSupply.sub(supplyDeltaUint);

            uint256 circBalance = currentSupply
                .sub(debase.balanceOf(stakingPool1))
                .sub(debase.balanceOf(stakingPool2));

            uint256 circBalanceShare = circBalance.div(currentSupply);
            uint256 newcircBalance = newSupply.mul(circBalanceShare);

            debtBalance.add(circBalanceShare.sub(newcircBalance));
        } else {
            uint256 poolBalance = debase.balanceOf(address(this));
        }
        return 0;
    }

    function issueCoupons(uint256 debtAmountToBuy)
        internal
        view
        returns (uint256)
    {
        uint256 circSupply = debase
            .totalSupply()
            .sub(debase.balanceOf(stakingPool1))
            .sub(debase.balanceOf(stakingPool2));

        uint256 currentDebtRatio = debtBalance.div(circSupply);
        uint256 newDebtRatio = (debtBalance.sub(debtAmountToBuy)).div(
            circSupply.sub(debtAmountToBuy)
        );

        require(
            currentDebtRatio < 1 && newDebtRatio < 1,
            "Debt ratio can't be 1 or more"
        );

        uint256 numenator = ((1 - currentDebtRatio).mul(1 - newDebtRatio)).mul(
            3
        );

        require(numenator > 0);
        return (1 / numenator).sub(uint256(1 / 3));
    }

    function buyDebt(uint256 debtAmountToBuy) external {
        require(debtBalance > 0, "No debt to buy");
        require(
            debtAmountToBuy <= debtBalance,
            "Cant buy more debt than it avaiable"
        );
        uint256 couponsBought = issueCoupons(debtAmountToBuy);

        userCouponBalances[msg.sender] = couponsBought;
        couponsIssued = couponsIssued.add(couponsBought);

        debtBalance = debtBalance.sub(
            debtAmountToBuy,
            "Can't buy more debt that issued"
        );

        debase.safeTransfer(address(this), debtAmountToBuy);
    }

    function calculateCurrentPrice() internal view returns (uint256) {
        uint256 res0;
        uint256 res1;
        uint256 timestamp;
        (res0, res1, timestamp) = debaseDaiUniPair.getReserves();
        return (res0.div(res1)).mul(10**18);
    }

    function sellCoupons(uint256 couponsAmountToSell) external {
        require(couponsIssued > 0, "No coupons to sell");
        uint256 price = calculateCurrentPrice();
    }
}
