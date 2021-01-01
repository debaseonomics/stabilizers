import { ethers } from 'hardhat';
import { ContractTransaction, Signer } from 'ethers';
import { expect } from 'chai';

import IncentivizerArtifact from '../../artifacts/contracts/Randomized-Threshold-Counter/RandomizedCounter.sol/RandomizedCounter.json';
import DebaseArtifact from '../../artifacts/contracts/Randomized-Threshold-Counter/Mock/Debase.sol/Debase.json';
import TokenArtifact from '../../artifacts/contracts/Randomized-Threshold-Counter/Mock/Token.sol/Token.json';
import RandomNumberConsumerArtifact from '../../artifacts/contracts/Randomized-Threshold-Counter/RandomNumberConsumer.sol/RandomNumberConsumer.json';

import { RandomizedCounterFactory } from '../../typechain/RandomizedCounterFactory';
import { TokenFactory } from '../../typechain/TokenFactory';
import { DebaseFactory } from '../../typechain/DebaseFactory';
import { RandomNumberConsumerFactory } from '../../typechain/RandomNumberConsumerFactory';

import { Token } from '../../typechain/Token';
import { RandomizedCounter } from '../../typechain/RandomizedCounter';
import { Debase } from '../../typechain/Debase';
import { RandomNumberConsumer } from '../../typechain/RandomNumberConsumer';

import { parseEther, parseUnits } from 'ethers/lib/utils';

describe('Degov/Eth RandomizedCounter', function() {
	let accounts: Signer[];
	let randomizedCounterFactory: RandomizedCounterFactory;
	let randomNumberConsumerFactory: RandomNumberConsumerFactory;
	let tokenFactory: TokenFactory;
	let debaseFactory: DebaseFactory;

	before(async function() {
		accounts = await ethers.getSigners();

		randomizedCounterFactory = (new ethers.ContractFactory(
			IncentivizerArtifact.abi,
			IncentivizerArtifact.bytecode,
			accounts[0]
		) as any) as RandomizedCounterFactory;

		randomNumberConsumerFactory = (new ethers.ContractFactory(
			RandomNumberConsumerArtifact.abi,
			RandomNumberConsumerArtifact.bytecode,
			accounts[0]
		) as any) as RandomNumberConsumerFactory;

		debaseFactory = (new ethers.ContractFactory(
			DebaseArtifact.abi,
			DebaseArtifact.bytecode,
			accounts[0]
		) as any) as DebaseFactory;

		tokenFactory = (new ethers.ContractFactory(
			TokenArtifact.abi,
			TokenArtifact.bytecode,
			accounts[0]
		) as any) as TokenFactory;
	});

	describe('Deploy and Initialize', function() {
		let randomizedCounter: RandomizedCounter;
		let randomNumberConsumer: RandomNumberConsumer;
		let degovLP: Token;
		let link: Token;
		let debase: Debase;
		let address: string;

		const duration = 4 * 24 * 60 * 60;
		const userLpLimit = parseEther('10');
		const userLpEnable = true;
		const poolLpLimit = parseEther('100');
		const poolLpEnable = true;
		const rewardPercentage = parseUnits('1', 17);
		const revokePercentage = parseUnits('1', 17);
		const mean = 5;
		const dis = 2;
		//prettier-ignore
		const normalDistribution = [8, 5, 4, 7, 10, 7, 5, 5, 3, 8, 5, 5, 3, 8, 4, 6, 5, 5, 3, 7, 6, 9, 8, 7, 6, 6, 5, 8, 6, 2, 8, 9, 5, 5, 4, 3, 8, 1, 5, 5, 5, 3, 5, 4, 8, 5, 6, 3, 4, 1, 3, 4, 3, 6, 4, 6, 5, 7, 6, 7, 5, 4, 1, 5, 6, 5, 7, 9, 3, 5, 4, 7, 3, 8, 7, 5, 5, 8, 0, 7, 4, 3, 6, 6, 4, 4, 5, 2, 4, 6, 6, 8, 8, 3, 7, 6, 7, 4, 4, 6]

		before(async function() {
			address = await accounts[0].getAddress();

			debase = await debaseFactory.deploy();
			degovLP = await tokenFactory.deploy('DEGOVLP', 'DEGOVLP');
			link = await tokenFactory.deploy('LINK', 'LINK');

			randomNumberConsumer = await randomNumberConsumer.deploy();

			randomizedCounter = await RandomizedCounterFactory.initialize(
				debase.address,
				degovLP.address,
				address,
				randomNumberConsumer.address,
				link.address,
				rewardPercentage,
				duration,
				userLpEnable,
				userLpLimit,
				poolLpEnable,
				poolLpLimit
			);
		});

		describe('Initial settings check', function() {
			it('Reward token should be debase', async function() {
				expect(await randomizedCounter.debase()).eq(debase.address);
			});
			it('Pair token should be degov lp', async function() {
				expect(await randomizedCounter.y()).eq(degovLP.address);
			});
			it('Policy should be policy contract', async function() {
				expect(await randomizedCounter.policy()).eq(address);
			});
			it('Duration should be correct', async function() {
				expect(await randomizedCounter.blockDuration()).eq(duration);
			});
			it('eward Percentage should be correct', async function() {
				expect(await randomizedCounter.rewardPercentage()).eq(rewardPercentage);
			});
			it('Pool should be  disabled', async function() {
				expect(await randomizedCounter.poolEnabled()).false;
			});
			it('User lp limit should be enabled', async function() {
				expect(await randomizedCounter.enableUserLpLimit()).eq(userLpEnable);
			});
			it('User lp limit should be correct', async function() {
				expect(await randomizedCounter.userLpLimit()).eq(userLpLimit);
			});
			it('Pool lp limit should be enabled', async function() {
				expect(await randomizedCounter.enablePoolLpLimit()).eq(poolLpEnable);
			});
			it('Pool lp limit should be correct', async function() {
				expect(await randomizedCounter.poolLpLimit()).eq(poolLpLimit);
			});
		});
	});

	describe('Basic Operation', () => {
		let randomizedCounter: RandomizedCounter;
		let degovLP: Token;
		let debase: Debase;
		let address: string;
		let degovLpUser2: Token;
		let incentivizer2: RandomizedCounter;

		let duration = 10;
		const userLpLimit = parseEther('10');
		const userLpEnable = true;
		const poolLpLimit = parseEther('15');
		const poolLpEnable = true;
		const rewardPercentage = parseUnits('1', 17);

		describe('User/Pool Lp Limits', () => {
			before(async function() {
				address = await accounts[0].getAddress();
				let address2 = await accounts[1].getAddress();

				debase = await debaseFactory.deploy();
				degovLP = await tokenFactory.deploy('DEGOVLP', 'DEGOVLP');
				degovLpUser2 = await degovLP.connect(accounts[1]);

				await degovLP.transfer(address2, parseEther('20'));

				randomizedCounter = await RandomizedCounterFactory.initialize(
					debase.address,
					degovLP.address,
					address,
					rewardPercentage,
					duration,
					userLpEnable,
					userLpLimit,
					poolLpEnable,
					poolLpLimit
				);

				incentivizer2 = await randomizedCounter.connect(accounts[1]);

				await randomizedCounter.setPoolEnabled(true);
				await degovLP.approve(randomizedCounter.address, parseEther('20'));
				await degovLpUser2.approve(randomizedCounter.address, parseEther('20'));
			});
			it('User cant stake more than user lp limit once', async function() {
				await expect(randomizedCounter.stake(parseEther('11'))).to.be.revertedWith(
					'Cant stake more than lp limit'
				);
			});
			it('User cant stake more than user lp limit when combined with previous user stakes', async function() {
				await randomizedCounter.stake(parseEther('6'));
				await expect(randomizedCounter.stake(parseEther('5'))).to.be.revertedWith(
					'Cant stake more than lp limit'
				);
			});
			it('Users cant stake more pool lp limit', async function() {
				await expect(incentivizer2.stake(parseEther('10'))).to.be.revertedWith(
					'Cant stake pool lp limit reached'
				);
			});
		});

		describe('When Pool is disabled', () => {
			before(async function() {
				address = await accounts[0].getAddress();

				debase = await debaseFactory.deploy();
				degovLP = await tokenFactory.deploy('DEGOVLP', 'DEGOVLP');

				randomizedCounter = await RandomizedCounterFactory.initialize(
					debase.address,
					degovLP.address,
					address,
					rewardPercentage,
					duration,
					userLpEnable,
					userLpLimit,
					poolLpEnable,
					poolLpLimit
				);
				await degovLP.approve(randomizedCounter.address, parseEther('10'));
			});

			it('Should not be able to stake', async function() {
				await expect(randomizedCounter.stake(parseEther('10'))).to.be.reverted;
			});
			it('Should not be able to withdraw', async function() {
				await expect(randomizedCounter.withdraw(parseEther('10'))).to.be.reverted;
			});
		});
		describe('When Pool is enabled', () => {
			describe('When pool is not rewarded balance', () => {
				before(async function() {
					address = await accounts[0].getAddress();

					debase = await debaseFactory.deploy();
					degovLP = await tokenFactory.deploy('DEGOVLP', 'DEGOVLP');

					randomizedCounter = await RandomizedCounterFactory.initialize(
						debase.address,
						degovLP.address,
						address,
						rewardPercentage,
						duration,
						userLpEnable,
						userLpLimit,
						poolLpEnable,
						poolLpLimit
					);

					await randomizedCounter.setPoolEnabled(true);
					await degovLP.approve(randomizedCounter.address, parseEther('10'));
				});
				it('Should be enabled', async function() {
					expect(await randomizedCounter.poolEnabled()).to.be.true;
				});
				it('Should be able to stake', async function() {
					expect(await randomizedCounter.stake(parseEther('10')));
				});
				it('Should have correct stake balance', async function() {
					expect(await randomizedCounter.balanceOf(address)).to.eq(parseEther('10'));
				});
				it('Should be able to withdraw', async function() {
					expect(await randomizedCounter.withdraw(parseEther('10')));
				});
				it('Should not earn rewards', async function() {
					expect(await randomizedCounter.earned(address)).eq(0);
				});
			});

			describe('When pool is rewarded balance', () => {
				describe('For a single user', () => {
					describe('Simple Usage', () => {
						before(async function() {
							address = await accounts[0].getAddress();

							debase = await debaseFactory.deploy();
							degovLP = await tokenFactory.deploy('DEGOVLP', 'DEGOVLP');

							randomizedCounter = await RandomizedCounterFactory.initialize(
								debase.address,
								degovLP.address,
								address,
								rewardPercentage,
								duration,
								userLpEnable,
								userLpLimit,
								poolLpEnable,
								poolLpLimit
							);

							await randomizedCounter.setPoolEnabled(true);
							await degovLP.approve(randomizedCounter.address, parseEther('10'));
						});
						it('Should claim reward with correct amount', async function() {
							let reward = parseEther('100').mul(rewardPercentage).div(parseEther('1'));
							let share = reward.mul(parseEther('1')).div(await debase.totalSupply());
							let rewardRate = share.div(duration);

							await expect(randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('100'))).to
								.emit(randomizedCounter, 'LogStartNewDistribtionCycle')
								.withArgs(
									share,
									reward,
									rewardRate,
									(await randomizedCounter.lastUpdateBlock()).add(duration)
								);
						});
						it('Its reward Rate should be correct', async function() {
							await debase.transfer(
								randomizedCounter.address,
								parseEther('100').mul(rewardPercentage).div(parseEther('1'))
							);
							let expectedRewardRate = (await debase.balanceOf(randomizedCounter.address))
								.mul(parseEther('1'))
								.div(await debase.totalSupply())
								.div(duration);

							expect(await randomizedCounter.rewardRate()).to.eq(expectedRewardRate);
						});
						it('Should be able to stake', async function() {
							expect(await randomizedCounter.stake(parseEther('10')));
						});
						it('Should be able to withdraw', async function() {
							expect(await randomizedCounter.withdraw(parseEther('10')));
						});
						it('Should earn rewards', async function() {
							expect(await randomizedCounter.earned(address)).not.eq(0);
						});
						it('Should emit a transfer event when rewards are claimed', async function() {
							await expect(randomizedCounter.getReward()).to.emit(debase, 'Transfer');
						});
					});

					describe('Claiming Maximum Balance', () => {
						before(async function() {
							address = await accounts[0].getAddress();

							debase = await debaseFactory.deploy();
							degovLP = await tokenFactory.deploy('DEGOVLP', 'DEGOVLP');

							randomizedCounter = await RandomizedCounterFactory.initialize(
								debase.address,
								degovLP.address,
								address,
								rewardPercentage,
								2,
								userLpEnable,
								userLpLimit,
								poolLpEnable,
								poolLpLimit
							);

							await randomizedCounter.setPoolEnabled(true);
							await degovLP.approve(randomizedCounter.address, parseEther('10'));
							await randomizedCounter.stake(parseEther('10'));
							await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('100'));
							await debase.transfer(
								randomizedCounter.address,
								parseEther('100').mul(rewardPercentage).div(parseEther('1'))
							);
							await degovLP.approve(randomizedCounter.address, parseEther('10'));

							await degovLP.approve(randomizedCounter.address, parseEther('10'));

							await degovLP.approve(randomizedCounter.address, parseEther('10'));
						});
						it('Should have claimable % equal to % of debase sent after reward period has elapsed', async function() {
							let rewardRate = (await randomizedCounter.rewardRate()).mul(2);
							expect(await randomizedCounter.earned(address)).eq(rewardRate);
						});
						it('Should transfer correct amount of debase on get reward', async function() {
							await expect(randomizedCounter.getReward()).to
								.emit(randomizedCounter, 'LogRewardPaid')
								.withArgs(address, parseEther('100').mul(rewardPercentage).div(parseEther('1')));
						});
					});
				});
			});
		});
	});
	describe('Operation Under Rebases', () => {
		let randomizedCounter: RandomizedCounter;
		let degovLP: Token;
		let debase: Debase;
		let address: string;

		let duration = 10;
		let rewardRateBefore: any;
		const userLpLimit = parseEther('10');
		const userLpEnable = true;
		const poolLpLimit = parseEther('100');
		const poolLpEnable = true;
		const rewardPercentage = parseUnits('1', 17);

		describe('Simple Operation', () => {
			describe('Positive Rebase', () => {
				before(async function() {
					address = await accounts[0].getAddress();

					debase = await debaseFactory.deploy();
					degovLP = await tokenFactory.deploy('DEGOVLP', 'DEGOVLP');

					randomizedCounter = await RandomizedCounterFactory.initialize(
						debase.address,
						degovLP.address,
						address,
						rewardPercentage,
						duration,
						userLpEnable,
						userLpLimit,
						poolLpEnable,
						poolLpLimit
					);

					await randomizedCounter.setPoolEnabled(true);
					await degovLP.approve(randomizedCounter.address, parseEther('10'));
					await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('100'));
					await debase.transfer(
						randomizedCounter.address,
						parseEther('100').mul(rewardPercentage).div(parseEther('1'))
					);
					rewardRateBefore = await randomizedCounter.rewardRate();
					await debase.rebase(1, parseEther('10000'));
				});

				it('Its reward Rate should not change after rebase', async function() {
					expect(await randomizedCounter.rewardRate()).to.eq(rewardRateBefore);
				});
				it('Should be able to stake', async function() {
					expect(await randomizedCounter.stake(parseEther('10')));
				});
				it('Should be able to withdraw', async function() {
					expect(await randomizedCounter.withdraw(parseEther('10')));
				});
				it('Should earn rewards', async function() {
					expect(await randomizedCounter.earned(address)).not.eq(0);
				});
				it('Should emit a transfer event when rewards are claimed', async function() {
					await expect(randomizedCounter.getReward()).to.emit(debase, 'Transfer');
				});
			});
			describe('Negative Rebase', () => {
				before(async function() {
					address = await accounts[0].getAddress();

					debase = await debaseFactory.deploy();
					degovLP = await tokenFactory.deploy('DEGOVLP', 'DEGOVLP');

					randomizedCounter = await RandomizedCounterFactory.initialize(
						debase.address,
						degovLP.address,
						address,
						rewardPercentage,
						duration,
						userLpEnable,
						userLpLimit,
						poolLpEnable,
						poolLpLimit
					);

					await randomizedCounter.setPoolEnabled(true);
					await degovLP.approve(randomizedCounter.address, parseEther('10'));
					await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('100'));
					await debase.transfer(
						randomizedCounter.address,
						parseEther('100').mul(rewardPercentage).div(parseEther('1'))
					);
					rewardRateBefore = await randomizedCounter.rewardRate();
					await debase.rebase(1, parseEther('10000').mul(-1));
				});
				it('Its reward Rate should not change after rebase', async function() {
					expect(await randomizedCounter.rewardRate()).to.eq(rewardRateBefore);
				});
				it('Should be able to stake', async function() {
					expect(await randomizedCounter.stake(parseEther('10')));
				});
				it('Should be able to withdraw', async function() {
					expect(await randomizedCounter.withdraw(parseEther('10')));
				});
				it('Should earn rewards', async function() {
					expect(await randomizedCounter.earned(address)).not.eq(0);
				});
				it('Should emit a transfer event when rewards are claimed', async function() {
					await expect(randomizedCounter.getReward()).to.emit(debase, 'Transfer');
				});
			});
		});

		describe('Claim maximum Balance', () => {
			describe('Positive Rebase', () => {
				before(async function() {
					address = await accounts[0].getAddress();

					debase = await debaseFactory.deploy();
					degovLP = await tokenFactory.deploy('DEGOVLP', 'DEGOVLP');

					randomizedCounter = await RandomizedCounterFactory.initialize(
						debase.address,
						degovLP.address,
						address,
						rewardPercentage,
						2,
						userLpEnable,
						userLpLimit,
						poolLpEnable,
						poolLpLimit
					);

					await randomizedCounter.setPoolEnabled(true);
					await degovLP.approve(randomizedCounter.address, parseEther('10'));
					await randomizedCounter.stake(parseEther('10'));
					await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('100'));
					await debase.transfer(
						randomizedCounter.address,
						parseEther('100').mul(rewardPercentage).div(parseEther('1'))
					);
					rewardRateBefore = await randomizedCounter.rewardRate();
					await debase.rebase(1, parseEther('10000'));

					await degovLP.approve(randomizedCounter.address, parseEther('10'));

					await degovLP.approve(randomizedCounter.address, parseEther('10'));

					await degovLP.approve(randomizedCounter.address, parseEther('10'));
				});
				it('Should have claimable % equal to % of debase sent after reward period has elapsed', async function() {
					let totalReward = rewardRateBefore.mul(2);
					expect(await randomizedCounter.earned(address)).eq(totalReward);
				});
				it('Pool balance should be zero after get reward', async function() {
					await randomizedCounter.getReward();
					expect(await debase.balanceOf(randomizedCounter.address)).eq(0);
				});
			});
			describe('Negative Rebase', () => {
				before(async function() {
					address = await accounts[0].getAddress();

					debase = await debaseFactory.deploy();
					degovLP = await tokenFactory.deploy('DEGOVLP', 'DEGOVLP');

					randomizedCounter = await RandomizedCounterFactory.initialize(
						debase.address,
						degovLP.address,
						address,
						rewardPercentage,
						2,
						userLpEnable,
						userLpLimit,
						poolLpEnable,
						poolLpLimit
					);

					await randomizedCounter.setPoolEnabled(true);
					await degovLP.approve(randomizedCounter.address, parseEther('10'));
					await randomizedCounter.stake(parseEther('10'));
					await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('100'));
					await debase.transfer(
						randomizedCounter.address,
						parseEther('100').mul(rewardPercentage).div(parseEther('1'))
					);
					rewardRateBefore = await randomizedCounter.rewardRate();
					await debase.rebase(1, parseEther('10000').mul(-1));

					await degovLP.approve(randomizedCounter.address, parseEther('10'));

					await degovLP.approve(randomizedCounter.address, parseEther('10'));

					await degovLP.approve(randomizedCounter.address, parseEther('10'));
				});
				it('Should have claimable % equal to % of debase sent after reward period has elapsed', async function() {
					let totalReward = rewardRateBefore.mul(2);
					expect(await randomizedCounter.earned(address)).eq(totalReward);
				});
				it('Pool balance should be zero after get reward', async function() {
					await randomizedCounter.getReward();
					expect(await debase.balanceOf(randomizedCounter.address)).eq(0);
				});
			});
		});
	});
});
