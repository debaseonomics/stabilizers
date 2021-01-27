// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import "../RandomizedCounter.sol";
import "./Token.sol";

contract MockRandomNumberConsumer {
    uint256 public fee;
    uint256 public randomResult;


    // The address to which withdrawn link are given
    address public multiSigSafe;
    // The address that can request new random numbers
    RandomizedCounter public randomizedCounter;
    Token public link;

    constructor(
        address multiSigSafe_,
        RandomizedCounter randomizedCounter_,
        Token link_,
        uint256 fee_
    ) public {
        multiSigSafe = multiSigSafe_;
        randomizedCounter = randomizedCounter_;
        fee = fee_;
        link = link_;
    }

    function getRandomNumber(uint256 seed) public {
        require(
            msg.sender == address(randomizedCounter),
            "Only counter can call this function"
        );
        link.transfer(address(1),fee);
    }

    function fulfillRandomness(uint256 num) external {
        randomResult = num;
        randomizedCounter.claimer(num);
    }

    function withdrawLink() external {
        require(
            msg.sender == multiSigSafe,
            "Only multi sig safe can withdraw link"
        );
        require(
            link.transfer(msg.sender, link.balanceOf(address(this))),
            "Unable to transfer"
        );
    }
}
