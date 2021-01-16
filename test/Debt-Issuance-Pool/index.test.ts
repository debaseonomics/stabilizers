import { ethers } from 'hardhat';
import { BigNumber, Signer } from 'ethers';
import { expect } from 'chai';

import { formatEther, parseEther, parseUnits } from 'ethers/lib/utils';

import BurnPoolArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/BurnPool.sol/BurnPool.json';
import OracleArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/Oracle.sol/Oracle.json';

import { BurnPoolFactory } from '../../typechain/BurnPoolFactory';
import { OracleFactory } from '../../typechain/OracleFactory';

import { BurnPool } from '../../typechain/BurnPool';
import { Oracle } from '../../typechain/Oracle';

describe('Debt Issuance Pool', () => {
	let accounts: Signer[];
	let burnPoolFactory: BurnPoolFactory;
	let oracleFactory: OracleFactory;

	before(async function() {
		accounts = await ethers.getSigners();

		burnPoolFactory = (new ethers.ContractFactory(
			BurnPoolArtifact.abi,
			BurnPoolArtifact.bytecode,
			accounts[0]
		) as any) as BurnPoolFactory;

		oracleFactory = (new ethers.ContractFactory(
			OracleArtifact.abi,
			OracleArtifact.bytecode,
			accounts[0]
		) as any) as OracleFactory;
	});

	describe('Deploy and Initialize', () => {
		let burnPool: BurnPool;
		let oracle: Oracle;
		let address: string;

		const debase = '0x9248c485b0B80f76DA451f167A8db30F33C70907';
		const dai = '0x6b175474e89094c44da98b954eedeac495271d0f';
		const policy = '0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD';
		const burnPool1 = '0xF4168cc431e9a8310e595dB9F7E2564cC96F5D51';
		const burnPool2 = '0xf5cB771023706Ca566eA6128b88e03A262737479';

		const epochs = 0;
		const oraclePeriod = 10;
		const curveShifter = 0;
		const mean = '0x00000000000000000000000000000000';
		const deviation = '0x3fff0000000000000000000000000000';
		const oneDivDeviationSqrtTwoPi = '0x40353af632a67dd1dd8e38e38e38e38e';
		const twoDeviationSquare = '0x40000000000000000000000000000000';

		before(async function() {
			address = await accounts[0].getAddress();
			burnPool = await burnPoolFactory.deploy();
			oracle = await oracleFactory.deploy(debase, dai, burnPool.address);

			await burnPool.initialize(
				debase,
				oracle.address,
				policy,
				burnPool1,
				burnPool2,
				epochs,
				oraclePeriod,
				curveShifter,
				mean,
				deviation,
				oneDivDeviationSqrtTwoPi,
				twoDeviationSquare
			);
		});

		describe('Initial settings check', function() {
			it('Reward token should be debase', async function() {
				expect(await burnPool.debase()).eq(debase);
			});
			it('Policy should be policy contract', async function() {
				expect(await burnPool.policy()).eq(policy);
			});
			it('Duration should be correct', async function() {
				expect(await burnPool.oracle()).eq(oracle.address);
			});
			it('Reward token should be debase', async function() {
				expect(await burnPool.burnPool1()).eq(burnPool1);
			});
			it('Pair token should be degov lp', async function() {
				expect(await burnPool.burnPool2()).eq(burnPool2);
			});
			it('Policy should be policy contract', async function() {
				expect(await burnPool.epochs()).eq(epochs);
			});
			it('Duration should be correct', async function() {
				expect(await burnPool.oraclePeriod()).eq(oraclePeriod);
			});
		});
	});
});
