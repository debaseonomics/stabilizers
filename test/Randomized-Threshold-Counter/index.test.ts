import { ethers } from 'hardhat';
import { ContractTransaction, Signer } from 'ethers';
import { expect } from 'chai';

import RandomizedCounterArtifact from '../../artifacts/contracts/Randomized-Threshold-Counter/RandomizedCounter.sol/RandomizedCounter.json';
import { RandomizedCounterFactory } from '../../typechain/RandomizedCounterFactory';
import { RandomizedCounter } from '../../typechain/RandomizedCounter';

import { parseEther } from 'ethers/lib/utils';

describe('Randomized Threshold Counter', function() {
	let accounts: Signer[];
	let randomizedCounterFactory: RandomizedCounterFactory;

	before(async function() {
		accounts = await ethers.getSigners();

		randomizedCounterFactory = (new ethers.ContractFactory(
			RandomizedCounterArtifact.abi,
			RandomizedCounterArtifact.bytecode,
			accounts[0]
		) as any) as RandomizedCounterFactory;
	});

	describe('Deploy and Initialize', function() {
		let randomizedCounter: RandomizedCounter;
		const debase = '0x9248c485b0B80f76DA451f167A8db30F33C70907';
		const dai = '0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735';
		const policy = '0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD';
		const rewardAmount = parseEther('100');
		const duration = 4 * 24 * 60 * 60;

		before(async function() {
			randomizedCounter = await randomizedCounterFactory.deploy();

			const tx = await randomizedCounter.initialize(
				'Random Counter',
				debase,
				dai,
				policy,
				rewardAmount,
				duration
			);

			tx.wait(1);
		});

		describe('Initial settings', function() {
			it('Counter reward token should be debase', async function() {
				expect(await randomizedCounter.rewardToken()).eq(debase);
			});

			it('Counter pair token should be dai', async function() {
				expect(await randomizedCounter.y()).eq(dai);
			});

			it('Counter policy should be policy contract', async function() {
				expect(await randomizedCounter.policy()).eq(policy);
			});

			it('Counter reward amount should be correct', async function() {
				expect(await randomizedCounter.rewardAmount()).eq(rewardAmount);
			});

			it('Counter duration should be correct', async function() {
				expect(await randomizedCounter.duration()).eq(duration);
			});

			it('Counter pool should be disabled', async function() {
				expect(await randomizedCounter.poolEnabled()).false;
			});

			it('Counter count in sequence should be true', async function() {
				expect(await randomizedCounter.countInSequence()).true;
			});

			it('Counter initial count should be zero', async function() {
				expect(await randomizedCounter.count()).eq(0);
			});

			it('Counter revoke reward should be disabled', async function() {
				expect(await randomizedCounter.revokeReward()).false;
			});

			it('Counter reward before period finished be disabled', async function() {
				expect(await randomizedCounter.beforePeriodFinish()).false;
			});
		});
	});

	describe('Check Stabilizer And Get Reward Function', function() {
		let randomizedCounter: RandomizedCounter;
		let result: ContractTransaction;
		let countBefore: any;
		let totalRewardsBefore: any;
		let account: string;

		const debase = '0x9248c485b0B80f76DA451f167A8db30F33C70907';
		const dai = '0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735';
		const policy = '0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD';
		const rewardAmount = parseEther('10');
		const duration = 4 * 24 * 60 * 60;

		describe('When supply delta is less than or equal to zero', function() {
			before(async function() {
				randomizedCounter = await randomizedCounterFactory.deploy();
				account = await accounts[0].getAddress();
				let result = await randomizedCounter.initialize(
					'Random Counter',
					debase,
					dai,
					account,
					rewardAmount,
					duration
				);
				await result.wait(1);
				countBefore = await randomizedCounter.count();
				totalRewardsBefore = await randomizedCounter.totalRewards();
				let tx = await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('1'));
				await tx.wait(1);
			});
			it('Pool period finish should not change', async function() {
				expect(await randomizedCounter.periodFinish()).eq(0);
			});
			it('Count should not increase', async function() {
				expect(await randomizedCounter.count()).eq(countBefore);
			});
			it('Total rewards should not decrease', async function() {
				expect(await randomizedCounter.totalRewards()).eq(totalRewardsBefore);
			});
		});

		describe('When supply delta is greater than zero', function() {
			describe('For single transaction', function() {
				before(async function() {
					randomizedCounter = await randomizedCounterFactory.deploy();
					account = await accounts[0].getAddress();
					let result = await randomizedCounter.initialize(
						'Random Counter',
						debase,
						dai,
						account,
						rewardAmount,
						duration
					);
					await result.wait(1);
					countBefore = await randomizedCounter.count();
					totalRewardsBefore = await randomizedCounter.totalRewards();
					let tx = await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('1'));
					await tx.wait(1);
				});
				it('Pool period finish should not change', async function() {
					expect(await randomizedCounter.periodFinish()).eq(0);
				});
				it('Count should not increase', async function() {
					expect(await randomizedCounter.count()).eq(countBefore);
				});
				it('Total rewards should not decrease', async function() {
					expect(await randomizedCounter.totalRewards()).eq(totalRewardsBefore);
				});
			});

			describe('Sequence counter check', () => {
				describe('Sequence flag enabled', () => {
					before(async function() {
						randomizedCounter = await randomizedCounterFactory.deploy();
						account = await accounts[0].getAddress();
						let result = await randomizedCounter.initialize(
							'Random Counter',
							debase,
							dai,
							account,
							rewardAmount,
							duration
						);
						await result.wait(1);
						countBefore = await randomizedCounter.count();
						totalRewardsBefore = await randomizedCounter.totalRewards();
						let tx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						await tx.wait(1);
					});
					it('Count in sequence flag should be true', async function() {
						expect(await randomizedCounter.countInSequence()).true;
					});
					it('Count should be 1 when supply delta is greater than zero', async function() {
						expect(await randomizedCounter.count()).eq(1);
					});
					it('Count should reset to 0 when supply delta <= zero', async function() {
						let tx = await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('1'));
						await tx.wait(1);
						expect(await randomizedCounter.count()).eq(0);
					});
				});
				describe('Sequence flag disabled', () => {
					before(async function() {
						randomizedCounter = await randomizedCounterFactory.deploy();
						account = await accounts[0].getAddress();
						let result = await randomizedCounter.initialize(
							'Random Counter',
							debase,
							dai,
							account,
							rewardAmount,
							duration
						);
						await result.wait(1);
						countBefore = await randomizedCounter.count();
						totalRewardsBefore = await randomizedCounter.totalRewards();
						let tx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						await tx.wait(1);
						tx = await randomizedCounter.setCountInSequence(false);
						tx.wait(1);
					});
					it('Count in sequence flag should be true', async function() {
						expect(await randomizedCounter.countInSequence()).false;
					});
					it('Count should be 1 when supply delta is greater than zero', async function() {
						expect(await randomizedCounter.count()).eq(1);
					});
					it('Count should be 1 when supply delta <= zero', async function() {
						let tx = await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('1'));
						await tx.wait(1);
						expect(await randomizedCounter.count()).eq(1);
					});
				});
			});

			describe('For normal mean of 8 and div 0', function() {
				describe('For 8 function calls and stabilizer balance less request amount', () => {
					before(async function() {
						randomizedCounter = await randomizedCounterFactory.deploy();

						account = await accounts[0].getAddress();
						let result = await randomizedCounter.initialize(
							'Random Counter',
							debase,
							dai,
							account,
							rewardAmount,
							duration
						);
						await result.wait(1);
						countBefore = await randomizedCounter.count();
						totalRewardsBefore = await randomizedCounter.totalRewards();

						//prettier-ignore
						await randomizedCounter.setNormalDistribution(8,0,[8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8])
						let transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						transferTx.wait(1);
					});
					it('Count before 8th call should be 7', async function() {
						expect(await randomizedCounter.count()).eq(7);
					});
					describe('Call function 8th time', () => {
						before(async function() {
							let tx = await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('1'));
							await tx.wait(1);
						});
						it('Pool period finish eq to zero', async function() {
							expect(await randomizedCounter.periodFinish()).eq(0);
						});
						it('Total rewards should not decrease', async function() {
							expect(await randomizedCounter.totalRewards()).eq(totalRewardsBefore);
						});
						it('Count after 8th call should be 0', async function() {
							expect(await randomizedCounter.count()).eq(0);
						});
						it('Total reward amount should not increase', async function() {
							expect(await randomizedCounter.totalRewards()).eq(0);
						});
					});
				});

				describe('For 8 function calls and stabilizer balance is more request amount', () => {
					before(async function() {
						randomizedCounter = await randomizedCounterFactory.deploy();

						account = await accounts[0].getAddress();
						let result = await randomizedCounter.initialize(
							'Random Counter',
							debase,
							dai,
							account,
							rewardAmount,
							duration
						);
						await result.wait(1);
						countBefore = await randomizedCounter.count();
						totalRewardsBefore = await randomizedCounter.totalRewards();

						//prettier-ignore
						await randomizedCounter.setNormalDistribution(8,0,[8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8])
						//prettier-ignore
						let transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
						transferTx.wait(1);
					});

					it('Count before 8th call should be 7', async function() {
						expect(await randomizedCounter.count()).eq(7);
					});
					describe('Call function 8th time', () => {
						before(async function() {
							let tx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
							await tx.wait(1);
						});
						it('Pool period finish not eq to zero', async function() {
							expect(await randomizedCounter.periodFinish()).not.eq(0);
						});
						it('Total rewards should not decrease', async function() {
							expect(await randomizedCounter.totalRewards()).not.eq(totalRewardsBefore);
						});
						it('Count after 8th call should be 0', async function() {
							expect(await randomizedCounter.count()).eq(0);
						});
					});
				});
			});
		});
	});
});
