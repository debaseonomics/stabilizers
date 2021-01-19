import { ethers, hardhatArguments, network } from 'hardhat';
import { BigNumber, Signer } from 'ethers';
import { expect } from 'chai';

import { formatEther, parseEther, parseUnits } from 'ethers/lib/utils';

import BurnPoolArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/BurnPool.sol/BurnPool.json';
import OracleArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/Oracle.sol/Oracle.json';
import DebasePolicyArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/Mock/DebasePolicy.sol/DebasePolicy.json';
import ERC20Artifact from '../../artifacts/contracts/Debt-Issuance-Pool/Mock/Debase.sol/ERC20.json';
import DebaseArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/Mock/Debase.sol/Debase.json';
import UniswapV2Router02Artifact from '../../artifacts/contracts/Debt-Issuance-Pool/Mock/UniswapV2Router02.sol/UniswapV2Router02.json';

import { BurnPoolFactory } from '../../typechain/BurnPoolFactory';
import { OracleFactory } from '../../typechain/OracleFactory';

import { BurnPool } from '../../typechain/BurnPool';
import { Oracle } from '../../typechain/Oracle';
import { Erc20 } from '../../typechain/Erc20';
import { DebasePolicy } from '../../typechain/DebasePolicy';
import { UniswapV2Router02 } from '../../typechain/UniswapV2Router02';
import { Debase } from '../../typechain/Debase';

describe('Debt Issuance Pool', () => {
	let accounts: Signer[];
	let burnPoolFactory: BurnPoolFactory;
	let oracleFactory: OracleFactory;
	let debasePolicy: DebasePolicy;
	let uniswapV2Router: UniswapV2Router02;
	let dai: Erc20;
	let daiUser: Erc20;
	let debase: Debase;
	let debaseUser: Debase;
	let account1: string;

	before(async function() {
		accounts = await ethers.getSigners();
		account1 = await accounts[0].getAddress();

		oracleFactory = (new ethers.ContractFactory(
			OracleArtifact.abi,
			OracleArtifact.bytecode,
			accounts[0]
		) as any) as OracleFactory;

		await network.provider.request({
			method: 'hardhat_impersonateAccount',
			params: [ '0xf038c1cfadace2c0e5963ab5c0794b9575e1d2c2' ]
		});

		await network.provider.request({
			method: 'hardhat_impersonateAccount',
			params: [ '0x6B175474E89094C44Da98b954EedeAC495271d0F' ]
		});

		await network.provider.request({
			method: 'hardhat_impersonateAccount',
			params: [ '0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD' ]
		});

		let multiSig = await ethers.provider.getSigner('0xf038c1cfadace2c0e5963ab5c0794b9575e1d2c2');
		let daiSig = await ethers.provider.getSigner('0x6B175474E89094C44Da98b954EedeAC495271d0F');
		let policySig = await ethers.provider.getSigner('0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD');

		burnPoolFactory = (new ethers.ContractFactory(
			BurnPoolArtifact.abi,
			BurnPoolArtifact.bytecode,
			policySig
		) as any) as BurnPoolFactory;

		debasePolicy = new ethers.Contract(
			'0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD',
			DebasePolicyArtifact.abi,
			multiSig
		) as DebasePolicy;

		uniswapV2Router = new ethers.Contract(
			'0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
			UniswapV2Router02Artifact.abi,
			accounts[0]
		) as UniswapV2Router02;

		debase = new ethers.Contract(
			'0x9248c485b0B80f76DA451f167A8db30F33C70907',
			DebaseArtifact.abi,
			accounts[0]
		) as Debase;

		debaseUser = debase.connect(accounts[0]);

		dai = new ethers.Contract('0x6B175474E89094C44Da98b954EedeAC495271d0F', ERC20Artifact.abi, daiSig) as Erc20;
		daiUser = dai.connect(accounts[0]);

		await dai.transfer(account1, parseEther('90000'));
		daiUser.approve(uniswapV2Router.address, parseEther('100'));

		await uniswapV2Router.swapExactTokensForTokens(
			parseEther('100'),
			parseEther('1'),
			[ '0x6B175474E89094C44Da98b954EedeAC495271d0F', '0x9248c485b0B80f76DA451f167A8db30F33C70907' ],
			account1,
			1621000900
		);
		await debasePolicy.setStabilizerPoolEnabled(1, false);
		await debasePolicy.setStabilizerPoolEnabled(2, false);
	});

	describe('Deploy and Initialize', () => {
		let burnPool: BurnPool;
		let burnPoolUser: BurnPool;
		let oracle: Oracle;

		const debaseAddress = '0x9248c485b0B80f76DA451f167A8db30F33C70907';
		const daiAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
		const policy = '0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD';
		const burnPool1 = '0xF4168cc431e9a8310e595dB9F7E2564cC96F5D51';
		const burnPool2 = '0xf5cB771023706Ca566eA6128b88e03A262737479';
		const multiSigAddress = '0xf038c1cfadace2c0e5963ab5c0794b9575e1d2c2';

		const epochs = 1;
		const oraclePeriod = 3;
		const curveShifter = 0;
		const initialRewardShare = parseUnits('5', 17);
		const multiSigReward = 0;
		const mean = '0x00000000000000000000000000000000';
		const deviation = '0x3fff0000000000000000000000000000';
		const oneDivDeviationSqrtTwoPi = '0x40353af632a67dd1dd8e38e38e38e38e';
		const twoDeviationSquare = '0x40000000000000000000000000000000';

		before(async function() {
			burnPool = await burnPoolFactory.deploy();
			burnPoolUser = burnPool.connect(accounts[0]);
			oracle = await oracleFactory.deploy(debaseAddress, daiAddress, burnPool.address);

			await burnPool.initialize(
				debaseAddress,
				oracle.address,
				policy,
				burnPool1,
				burnPool2,
				epochs,
				oraclePeriod,
				curveShifter,
				initialRewardShare,
				multiSigAddress,
				multiSigReward,
				mean,
				deviation,
				oneDivDeviationSqrtTwoPi,
				twoDeviationSquare
			);

			await burnPool.transferOwnership(multiSigAddress);
			await debasePolicy.addNewStabilizerPool(burnPool.address);
			await debasePolicy.setStabilizerPoolEnabled(3, true);
		});

		describe('Oracle initialized settings check', function() {
			it('Debase address should be correct', async function() {
				expect(await oracle.debase()).eq(debaseAddress);
			});
			it('Dai address should be correct', async function() {
				expect(await oracle.dai()).eq(daiAddress);
			});
			it('Pool address should be correct', async function() {
				expect(await oracle.pool()).eq(burnPool.address);
			});
		});

		describe('Burn pool initialization', function() {
			it('Debase address should be correct', async function() {
				expect(await burnPool.debase()).eq(debaseAddress);
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
				expect(await burnPool.initialRewardShare()).eq(initialRewardShare);
			});
			it('Curve shifter should be set correctly', async function() {
				expect(await burnPool.multiSigRewardShare()).eq(multiSigReward);
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

			describe('Basic Functionality', () => {
				describe('When first rebase has not fired', () => {
					it('Users should be not able to buy coupons', async function() {
						await debase.approve(burnPool.address, parseEther('10'));
						await expect(burnPoolUser.buyCoupons(parseEther('10'))).to.be.revertedWith(
							'Can only buy coupons with last rebase was negative'
						);
					});
				});

				describe('When first rebase has been fired', () => {
					describe('For neutral supply delta rebase', () => {
						it('Stabilizer function should not emit an accrue event', async function() {
							await expect(burnPool.checkStabilizerAndGetReward(0, 10, 0, parseEther('10'))).to.not.emit(
								burnPool,
								'LogRewardsAccrued'
							);
						});
						it('Reward accrue amount should be zero', async function() {
							expect(await burnPool.rewardsAccrued()).eq(0);
						});

						it('Reward enum should be set to neutral', async function() {
							expect(await burnPool.lastRebase()).eq(1);
						});

						it('Users should not be able to buy coupons', async function() {
							await debase.approve(burnPool.address, parseEther('10'));
							await expect(burnPoolUser.buyCoupons(parseEther('10'))).to.be.revertedWith(
								'Can only buy coupons with last rebase was negative'
							);
						});
					});

					describe('For negative supply delta rebase', () => {
						it('Stabilizer function should emit new coupon cycle event', async function() {
							const rewardAmount = (await burnPool.circBalance())
								.mul(await burnPool.initialRewardShare())
								.div(parseEther('1'));

							const rewardShare = rewardAmount.mul(parseEther('1')).div(await debase.totalSupply());

							await expect(burnPool.checkStabilizerAndGetReward(-1, 10, 0, parseEther('10'))).to
								.emit(burnPool, 'LogNewCouponCycle')
								.withArgs(0, 1, rewardShare, 0, 0, 0, 0, 0, 0, 0, 0);
						});

						it('User should be able to buy coupons and emit correct transfer event', async function() {
							await debaseUser.approve(burnPool.address, parseEther('10'));
							await expect(burnPoolUser.buyCoupons(parseEther('1'))).to
								.emit(debase, 'Transfer')
								.withArgs(account1, burnPool.address, parseEther('1'));
						});
						it('User should emit update oracle event', async function() {
							await debaseUser.approve(burnPool.address, parseEther('10'));
							await expect(burnPoolUser.buyCoupons(parseEther('1'))).to.emit(
								burnPoolUser,
								'LogOraclePriceAndPeriod'
							);
						});

						it('User should not be able to buy debt when price goes higher than lower price limit', async function() {
							daiUser.approve(uniswapV2Router.address, parseEther('45000'));

							await uniswapV2Router.swapExactTokensForTokens(
								parseEther('45000'),
								parseEther('1'),
								[
									'0x6B175474E89094C44Da98b954EedeAC495271d0F',
									'0x9248c485b0B80f76DA451f167A8db30F33C70907'
								],
								account1,
								1621000900
							);
							await debaseUser.approve(burnPool.address, parseEther('10'));
							await expect(burnPoolUser.buyCoupons(parseEther('1'))).to.be.revertedWith(
								'Can only buy coupons if price is lower than lower threshold'
							);
						});

						it('User should be able buy debt when price goes back down the limit', async function() {
							debaseUser.approve(uniswapV2Router.address, parseEther('45000'));

							await uniswapV2Router.swapExactTokensForTokens(
								parseEther('45000'),
								parseEther('1'),
								[
									'0x9248c485b0B80f76DA451f167A8db30F33C70907',
									'0x6B175474E89094C44Da98b954EedeAC495271d0F'
								],
								account1,
								1621000900
							);
							await debaseUser.approve(burnPool.address, parseEther('10'));
							await expect(burnPoolUser.buyCoupons(parseEther('1'))).to.not.be.revertedWith(
								'Can only buy coupons if price is lower than lower threshold'
							);
						});
					});
				});
			});
		});
	});
});
