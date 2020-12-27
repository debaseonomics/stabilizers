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

    constructor(address multiSigSafe_, RandomizedCounter randomizedCounter_)
        public
        VRFConsumerBase(
            0xb3dCcb4Cf7a26f6cf6B120Cf5A73875B7BBc655B, // VRF Coordinator
            0x01BE23585060835E02B77ef475b0Cc51aA1e0709 // LINK Token
        )
    {
        multiSigSafe = multiSigSafe_;
        randomizedCounter = randomizedCounter_;

        VRFCoordinator = 0xb3dCcb4Cf7a26f6cf6B120Cf5A73875B7BBc655B;
        keyHash = 0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311;
        fee = 0.1 * 10**18;
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
        require(LINK.balanceOf(address(this)) >= fee, "Not enough LINK");
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
