// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import "@chainlink/contracts/src/v0.6/VRFConsumerBase.sol";
import "./RandomizedCounter.sol";

contract RandomNumberConsumer is VRFConsumerBase {
    bytes32 internal keyHash;
    uint256 public fee;
    address public VRFCoordinator;

    uint256 public randomResult;

    // The address to which withdrawn link are given
    address public multiSigSafe;
    // The address that can request new random numbers
    RandomizedCounter public randomizedCounter;

    constructor(
        address multiSigSafe_,
        RandomizedCounter randomizedCounter_,
        address VRFCoordinator_,
        address link_,
        bytes32 keyHash_,
        uint256 fee_
    )
        public
        VRFConsumerBase(
            VRFCoordinator_, // VRF Coordinator
            link_ // LINK Token
        )
    {
        multiSigSafe = multiSigSafe_;
        randomizedCounter = randomizedCounter_;

        VRFCoordinator = VRFCoordinator_;
        keyHash = keyHash_;
        fee = fee_;
    }

    /**
     * Requests randomness from a user-provided seed
     */
    function getRandomNumber(uint256 userProvidedSeed)
        public
        returns (bytes32 requestId)
    {
        require(
            msg.sender == address(randomizedCounter),
            "Only counter can call this function"
        );
        return requestRandomness(keyHash, fee, userProvidedSeed);
    }

    /**
     * Callback function used by VRF Coordinator
     */
    function fulfillRandomness(bytes32 requestId, uint256 randomness)
        internal
        override
    {
        randomResult = randomness;
        randomizedCounter.claimer(randomResult);
    }

    function withdrawLink() external {
        require(
            msg.sender == multiSigSafe,
            "Only multi sig safe can withdraw link"
        );
        require(
            LINK.transfer(msg.sender, LINK.balanceOf(address(this))),
            "Unable to transfer"
        );
    }
}
