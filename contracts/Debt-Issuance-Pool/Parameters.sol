// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./lib/Decimal.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Parameters is Ownable {
    using SafeMath for uint256;
    using Decimal for Decimal.D256;

    uint256 public couponExpiration = 90;
    uint256 public debtRatioCap = 35e16; // 35%
    uint256 public couponRewardClaimPercentage;

    function setDebtRatioCap(uint256 debtRatioCap_) external onlyOwner {
        debtRatioCap = debtRatioCap_;
    }

    function setCouponExpiration(uint256 couponExpiration_) external onlyOwner {
        require(couponExpiration_ >= 1);
        couponExpiration = couponExpiration_;
    }

    function setCouponRewardClaimPercentage(
        uint256 couponRewardClaimPercentage_
    ) external onlyOwner {
        couponRewardClaimPercentage = couponRewardClaimPercentage_;
    }

    function getDebtRatioCap() internal view returns (Decimal.D256 memory) {
        return Decimal.D256({value: debtRatioCap});
    }
}
