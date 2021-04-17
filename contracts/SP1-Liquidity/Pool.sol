// SPDX-License-Identifier: MIT
pragma solidity ^0.6.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Pool is Ownable, Initializable {
    using SafeERC20 for IERC20;

    IERC20 public mph88;
    IERC20 public crv;
    address public rewarder;

    uint256 mphReward;
    uint256 crvReward;

    function setMPHreward(uint256 mphReward_) external onlyOwner {
        mphReward = mphReward_;
    }

    function setCRVreward(uint256 crvReward_) external onlyOwner {
        crvReward = crvReward_;
    }

    function initialize(
        IERC20 mph88_,
        IERC20 crv_,
        address rewarder_,
        uint256 mphReward_,
        uint256 crvReward_
    ) external initializer {
        mph88 = mph88_;
        crv = crv_;
        rewarder = rewarder_;

        mphReward = mphReward_;
        crvReward = crvReward_;
    }

    function claimReward() external returns (uint256, uint256) {
        require(msg.sender == rewarder);

        mph88.safeTransfer(rewarder, mphReward);
        crv.safeTransfer(rewarder, crvReward);

        return (mphReward, crvReward);
    }
}
