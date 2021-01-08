// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import "./Parameters.sol";

contract Coupons is Parameters {
    event LogRebase(uint256 indexed epoch_, uint256 totalSupply_);

    uint256 constant DECIMALS = 18;
    uint256 constant MAX_UINT256 = ~uint256(0);
    uint256 constant MAX_SUPPLY = ~uint128(0); // (2^128) - 1

    struct Cycle {
        uint256 totalGons;
        uint256 totalSupply;
        uint256 gonsPerFragment;
        mapping(address => uint256) gonBalances;
    }

    Cycle[] public cycles;

    function startCycle(uint256 supply, bool deletePreviousCycles) internal {
        if (deletePreviousCycles) {
            delete cycles;
        }

        uint256 totalGons = MAX_UINT256 - (MAX_UINT256 % supply);
        uint256 totalSupply = supply;
        uint256 gonsPerFragment = totalGons.div(supply);
        uint256 gonBalance = supply.mul(gonsPerFragment);

        //DO GON BALANCE WHEN YOU CAN!!!!
        cycles.push(Cycle(totalGons, totalSupply, gonsPerFragment));
    }

    /**
     * @dev Notifies Fragments contract about a new rebase cycle.
     * @param supplyDelta The number of new fragment tokens to add into circulation via expansion.
     * @return The total number of fragments after the supply adjustment.
     */
    function rebase(uint256 supplyDelta) internal returns (uint256) {
        Cycle storage instance = cycles[cycles.length.sub(1)];

        if (supplyDelta == 0) {
            return instance.totalSupply;
        }

        if (supplyDelta < 0) {
            instance.totalSupply = instance.totalSupply.sub(supplyDelta);
        } else {
            instance.totalSupply = instance.totalSupply.add(supplyDelta);
        }

        if (instance.totalSupply > MAX_SUPPLY) {
            instance.totalSupply = MAX_SUPPLY;
        }

        instance.gonsPerFragment = instance.totalGons.div(instance.totalSupply);

        return instance.totalSupply;
    }

    /**
     * @param who The address to query.
     * @return The balance of the specified address.
     */
    function balanceOfLastCycle(address who) public view returns (uint256) {
        if (cycles.length != 0) {
            Cycle storage instance = cycles[cycles.length.sub(1)];
            return instance.gonBalances[who].div(instance.gonsPerFragment);
        }
        return 0;
    }

    /**
     * @param who The address to query.
     * @return The balance of the specified address.
     */
    function totalBalanceOf(address who) public view returns (uint256) {
        uint256 balance;
        for (uint256 index = 0; index < cycles.length; index = index.add(1)) {
            Cycle storage instance = cycles[index];
            balance = balance.add(
                instance.gonBalances[who].div(instance.gonsPerFragment)
            );
        }
        return balance;
    }

    /**
     * @dev Assign tokens to a specified address.
     * @param to The address to transfer to.
     * @param value The amount to be transferred.
     */
    function assignCouponsToUser(address to, uint256 value) internal {
        Cycle storage instance = cycles[cycles.length.sub(1)];

        uint256 gonValue = value.mul(instance.gonsPerFragment);
        instance.gonBalances[msg.sender] = instance.gonBalances[msg.sender].sub(
            gonValue
        );
        instance.gonBalances[to] = instance.gonBalances[to].add(gonValue);
    }
}
