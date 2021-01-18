import { ethers, hardhatArguments, network } from 'hardhat';
import { BigNumber, Signer } from 'ethers';
import { expect } from 'chai';

import { formatEther, parseEther, parseUnits } from 'ethers/lib/utils';

import BurnPoolArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/BurnPool.sol/BurnPool.json';
import OracleArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/Oracle.sol/Oracle.json';
import DebasePolicyArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/Mock/DebasePolicy.sol/DebasePolicy.json';

import { BurnPoolFactory } from '../../typechain/BurnPoolFactory';
import { OracleFactory } from '../../typechain/OracleFactory';

import { BurnPool } from '../../typechain/BurnPool';
import { Oracle } from '../../typechain/Oracle';
import { DebasePolicy } from '../../typechain/DebasePolicy';

describe('Debt Issuance Pool', () => {
	let accounts: Signer[];
	let burnPoolFactory: BurnPoolFactory;
	let oracleFactory: OracleFactory;
	let debasePolicy: DebasePolicy;
	let account1: string;

	before(async function() {
		accounts = await ethers.getSigners();
		account1 = await accounts[0].getAddress();

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

		await network.provider.request({
			method: 'hardhat_impersonateAccount',
			params: [ '0xf038c1cfadace2c0e5963ab5c0794b9575e1d2c2' ]
		});

		let multiSig = await ethers.provider.getSigner('0xf038c1cfadace2c0e5963ab5c0794b9575e1d2c2');
		debasePolicy = new ethers.Contract(
			'0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD',
			DebasePolicyArtifact.abi,
			multiSig
		) as DebasePolicy;

		await debasePolicy.setStabilizerPoolEnabled(1, false);
		await debasePolicy.setStabilizerPoolEnabled(2, false);
	});

	describe('Deploy and Initialize', () => {
		let burnPool: BurnPool;
		let oracle: Oracle;
		let address: string;

		const debase = '0x9248c485b0B80f76DA451f167A8db30F33C70907';
		const dai = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
		const policy = '0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD';
		const burnPool1 = '0xF4168cc431e9a8310e595dB9F7E2564cC96F5D51';
		const burnPool2 = '0xf5cB771023706Ca566eA6128b88e03A262737479';

		const epochs = 0;
		const oraclePeriod = 10;
		const curveShifter = 0;
		const initialReward = 0;
		const multiSigReward = 0;
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
				initialReward,
				multiSigReward,
				mean,
				deviation,
				oneDivDeviationSqrtTwoPi,
				twoDeviationSquare
			);

			await debasePolicy.addNewStabilizerPool(burnPool.address);
			await debasePolicy.setStabilizerPoolEnabled(3, true);
			console.log(await debasePolicy.stabilizerPools(3));
		});

		describe('Oracle initialized settings check', function() {
			it('Debase address should be correct', async function() {
				expect(await oracle.debase()).eq(debase);
			});
			it('Dai address should be correct', async function() {
				expect(await oracle.dai()).eq(dai);
			});
			it('Pool address should be correct', async function() {
				expect(await oracle.pool()).eq(burnPool.address);
			});
		});

		describe('Burn pool initialization', function() {
			it('Debase address should be correct', async function() {
				expect(await burnPool.debase()).eq(debase);
			});
			it('Policy address should be correct', async function() {
				expect(await burnPool.policy()).eq(policy);
			});
			it('Oracle address should be correct', async function() {
				expect(await burnPool.oracle()).eq(oracle.address);
			});
			it('Burn pool 1 address should be correct', async function() {
				expect(await burnPool.burnPool1()).eq(burnPool1);
			});
			it('Burn pool 2 address should be correct', async function() {
				expect(await burnPool.burnPool2()).eq(burnPool2);
			});
			it('Epochs should be correct', async function() {
				expect(await burnPool.epochs()).eq(epochs);
			});
			it('Oracle period should be set correctly', async function() {
				expect(await burnPool.oraclePeriod()).eq(oraclePeriod);
			});
			it('Curve shifter should be set correctly', async function() {
				expect(await burnPool.curveShifter()).eq(curveShifter);
			});
			it('Oracle period should be set correctly', async function() {
				expect(await burnPool.initialReward()).eq(initialReward);
			});
			it('Curve shifter should be set correctly', async function() {
				expect(await burnPool.multiSigReward()).eq(multiSigReward);
			});
			it('Mean should be set correctly', async function() {
				expect(await burnPool.mean()).eq(mean);
			});
			it('Deviation should be set correctly', async function() {
				expect(await burnPool.deviation()).eq(deviation);
			});
			it('One dic deviation sqrt two pi should be set correctly', async function() {
				expect(await burnPool.oneDivDeviationSqrtTwoPi()).eq(oneDivDeviationSqrtTwoPi);
			});
			it('Two deviation square should be set correctly', async function() {
				expect(await burnPool.twoDeviationSquare()).eq(twoDeviationSquare);
			});

		});
	});
});
