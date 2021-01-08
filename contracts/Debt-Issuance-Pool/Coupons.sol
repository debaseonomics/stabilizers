// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import "@openzeppelin/contracts/math/SafeMath.sol";

contract Debase {
    using SafeMath for uint256;

    event LogRebase(uint256 indexed epoch_, uint256 totalSupply_);

    // Used for authentication
    address public burnPool;

    modifier onlyBurnPool() {
        require(msg.sender == burnPool);
        _;
    }

    uint256 private constant DECIMALS = 18;
    uint256 private constant MAX_UINT256 = ~uint256(0);
    uint256 private constant INITIAL_FRAGMENTS_SUPPLY = 100000 * 10**DECIMALS;

    uint256 private constant TOTAL_GONS =
        MAX_UINT256 - (MAX_UINT256 % INITIAL_FRAGMENTS_SUPPLY);

    uint256 private constant MAX_SUPPLY = ~uint128(0); // (2^128) - 1

    uint256 private _totalSupply;
    uint256 private _gonsPerFragment;
    mapping(address => uint256) private _gonBalances;

    constructor() public {
        _totalSupply = INITIAL_FRAGMENTS_SUPPLY;
        _gonsPerFragment = TOTAL_GONS.div(_totalSupply);

        burnPool = msg.sender;

        uint256 debaseDaiPoolVal = _totalSupply;
        uint256 debaseDaiPoolGons = debaseDaiPoolVal.mul(_gonsPerFragment);

        _gonBalances[msg.sender] = debaseDaiPoolGons;
    }

    /**
     * @dev Notifies Fragments contract about a new rebase cycle.
     * @param supplyDelta The number of new fragment tokens to add into circulation via expansion.
     * @return The total number of fragments after the supply adjustment.
     */
    function rebase(uint256 epoch, uint256 supplyDelta)
        external
        onlyBurnPool
        returns (uint256)
    {
        if (supplyDelta == 0) {
            emit LogRebase(epoch, _totalSupply);
            return _totalSupply;
        }

        if (supplyDelta < 0) {
            _totalSupply = _totalSupply.sub(supplyDelta);
        } else {
            _totalSupply = _totalSupply.add(supplyDelta);
        }

        if (_totalSupply > MAX_SUPPLY) {
            _totalSupply = MAX_SUPPLY;
        }

        _gonsPerFragment = TOTAL_GONS.div(_totalSupply);

        emit LogRebase(epoch, _totalSupply);
        return _totalSupply;
    }

    /**
     * @return The total number of fragments.
     */
    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    /**
     * @param who The address to query.
     * @return The balance of the specified address.
     */
    function balanceOf(address who) public view returns (uint256) {
        return _gonBalances[who].div(_gonsPerFragment);
    }

    /**
     * @dev Assign tokens to a specified address.
     * @param to The address to transfer to.
     * @param value The amount to be transferred.
     */
    function assignCouponsToUser(address to, uint256 value)
        public
        onlyBurnPool
    {
        uint256 gonValue = value.mul(_gonsPerFragment);
        _gonBalances[msg.sender] = _gonBalances[msg.sender].sub(gonValue);
        _gonBalances[to] = _gonBalances[to].add(gonValue);
    }
}
