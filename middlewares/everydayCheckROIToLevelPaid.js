import AdminModel from "../schemas/admin.schema.js";
import UserModel from "../schemas/user.schema.js";

function formatDateLocal(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const ROI_CONFIG = [
  { min: 100, max: 999, rate: 0.04 },
  { min: 1000, max: 4999, rate: 0.05 },
  { min: 5000, max: Infinity, rate: 0.06 },
];

const ROI_TO_LEVEL_CONFIG = [
  { level: 0, rate: 0.1 },
  { level: 1, rate: 0.09 },
  { level: 2, rate: 0.08 },
  { level: 3, rate: 0.07 },
  { level: 4, rate: 0.06 },
  { level: 5, rate: 0.05 },
  { level: 6, rate: 0.04 },
  { level: 7, rate: 0.04 },
  { level: 8, rate: 0.03 },
  { level: 9, rate: 0.03 },
  { level: 10, rate: 0.02 },
  { level: 11, rate: 0.02 },
  { level: 12, rate: 0.02 },
  { level: 13, rate: 0.02 },
  { level: 14, rate: 0.02 },
  { level: 15, rate: 0.01 },
  { level: 16, rate: 0.01 },
  { level: 17, rate: 0.01 },
  { level: 18, rate: 0.01 },
  { level: 19, rate: 0.01 },
];

function getDailyRoiRate(amount) {
  return (
    ROI_CONFIG.find((cfg) => amount >= cfg.min && amount <= cfg.max)?.rate || 0
  );
}

function mergeSponsorOps(sponsorOps) {
  const merged = {};

  for (const op of sponsorOps) {
    const id = op.updateOne.filter._id.toString(); // sponsor’s _id

    if (!merged[id]) {
      merged[id] = { $inc: {}, $set: {} };
    }

    const { $inc = {}, $set = {} } = op.updateOne.update;

    // Merge $inc values
    for (const [field, value] of Object.entries($inc)) {
      merged[id].$inc[field] = (merged[id].$inc[field] || 0) + value;
    }

    // Merge $set values (last one wins, safe for flags like subscribed)
    for (const [field, value] of Object.entries($set)) {
      merged[id].$set[field] = value;
    }
  }

  // Convert back into bulkWrite format
  return Object.entries(merged).map(([id, update]) => {
    const cleanUpdate = {};
    if (Object.keys(update.$inc).length > 0) cleanUpdate.$inc = update.$inc;
    if (Object.keys(update.$set).length > 0) cleanUpdate.$set = update.$set;

    return {
      updateOne: {
        filter: { _id: id },
        update: cleanUpdate,
      },
    };
  });
}

const payROIToLevelIncome = async (user, reward, userMap) => {
  const sponsorOps = [];
  let currentSponsorId = user.sponsorId;
  let level = 0;

  while (level < ROI_TO_LEVEL_CONFIG.length && currentSponsorId) {
    // const referrer = await UserModel.findOne({ referalId: currentSponsorId });
    const referrer = userMap.get(currentSponsorId);

    if (!referrer) break;

    const levelConfig = ROI_TO_LEVEL_CONFIG[level];
    if (!levelConfig) break;

    const levelReward = reward * levelConfig.rate;
    const update = { $inc: {} };

    if (!referrer.subscribed) {
      update.$inc.pendingWallet = levelReward;
      update.$inc.pendingRoiToLevelIncome = levelReward;
    } else {
      update.$inc.mainWallet = levelReward;
      update.$inc.roiToLevelIncome = levelReward;
    }

    sponsorOps.push({
      updateOne: {
        filter: { _id: referrer._id },
        update,
      },
    });

    // Move up to next sponsor
    currentSponsorId = referrer.sponsorId;
    level++;
  }


  return sponsorOps;
};

const everyDayCheckROIToLevelPaidMiddleware = async (req, res, next) => {
  try {
    console.log("everyDayCheckROIToLevelPaidMiddleware: Starting daily ROI check.");
    const currDate = new Date();
    currDate.setHours(0, 0, 0, 0);
    const todayDateString = formatDateLocal(currDate);
    console.log(`everyDayCheckROIToLevelPaidMiddleware: Current date (local): ${todayDateString}`);

    const admin = await AdminModel.findOne({});
    if (!admin) {
      console.error("everyDayCheckROIToLevelPaidMiddleware: Admin document not found. Cannot proceed with ROI check.");
      return res.status(500).json({ message: "Admin configuration missing." });
    }
    console.log("everyDayCheckROIToLevelPaidMiddleware: Admin document found.");

    if (admin.everyDayCheckROIToLevelPaid.get(todayDateString)) {
      console.log(`everyDayCheckROIToLevelPaidMiddleware: Already processed for ${todayDateString}, skipping.`);
      return next();
    }

    const lastCheckDateString = Array.from(
      admin.everyDayCheckROIToLevelPaid.keys()
    )
      .sort()
      .pop();
    const lastCheckDate = lastCheckDateString
      ? new Date(lastCheckDateString)
      : null;

    console.log(`everyDayCheckROIToLevelPaidMiddleware: Last processed date string: ${lastCheckDateString || 'N/A'}`);
    console.log(`everyDayCheckROIToLevelPaidMiddleware: Last processed date object: ${lastCheckDate || 'N/A'}`);

    const startDate = lastCheckDate
      ? new Date(lastCheckDate.getTime() + 86400000) // next day
      : currDate;

    console.log(`everyDayCheckROIToLevelPaidMiddleware: Starting date for processing loop: ${formatDateLocal(startDate)}`);

    for (
      let d = new Date(startDate);
      d <= currDate;
      d.setDate(d.getDate() + 1)
    ) {
      const loopDateString = formatDateLocal(d);
      const isWeekend = [0, 6].includes(d.getDay());
      console.log(`everyDayCheckROIToLevelPaidMiddleware: Processing date: ${loopDateString}`);

      if (admin.everyDayCheckROIToLevelPaid.get(loopDateString)) {
        console.log(`everyDayCheckROIToLevelPaidMiddleware: Already processed for ${loopDateString}, continuing to next day.`);
        continue;
      }

      if (isWeekend) {
        console.log(`everyDayCheckROIToLevelPaidMiddleware: Skipping ${loopDateString} (weekend).`);
      } else {
        console.log(`everyDayCheckROIToLevelPaidMiddleware: Executing ROI logic for ${loopDateString}.`);
        const users = await UserModel.find({
          subscribed: true,
          lastInvestmentDoneOnDate: { $exists: true, $ne: null },
        });
        console.log(`everyDayCheckROIToLevelPaidMiddleware: Found ${users.length} subscribed users for ${loopDateString}.`);

        const userMap = new Map(users.map((u) => [u.referalId, u]));

        const bulkOps = [];
        const sponsorOps = [];

        for (const user of users) {
          if (
            user.subscribed &&
            user.lastInvestmentDoneOnDate &&
            d > user.lastInvestmentDoneOnDate
          ) {
            console.log(`everyDayCheckROIToLevelPaidMiddleware: Processing ROI for user ID: ${user._id}, Investment: ${user.lastInvestment}`);
            const rate = getDailyRoiRate(user.lastInvestment);
            const reward = user.lastInvestment * rate;

            const newTotal = user.lastInvestmentRoiWallet + reward;
            const unsubscribed = newTotal >= 2 * user.lastInvestment;

            const maxReward =
              2 * user.lastInvestment - user.lastInvestmentRoiWallet;
            const actualReward = Math.min(reward, maxReward);
            console.log(`everyDayCheckROIToLevelPaidMiddleware: User ${user._id} - Daily ROI rate: ${rate}, Calculated reward: ${reward}, Actual reward: ${actualReward}, Unsubscribed: ${unsubscribed}`);

            bulkOps.push({
              updateOne: {
                filter: { _id: user._id },
                update: {
                  $inc: {
                    roiWallet: actualReward,
                    lastInvestmentRoiWallet: actualReward,
                  },
                  ...(unsubscribed ? { $set: { subscribed: false } } : {}),
                },
              },
            });

            const ops = await payROIToLevelIncome(user, reward, userMap);
            sponsorOps.push(...ops);
            console.log(`everyDayCheckROIToLevelPaidMiddleware: Collected ${ops.length} sponsor operations for user ${user._id}.`);
          }
        }

        // Execute both bulk operations
        if (bulkOps.length > 0) {
          console.log(`everyDayCheckROIToLevelPaidMiddleware: Executing ${bulkOps.length} user ROI bulk operations for ${loopDateString}.`);
          await UserModel.bulkWrite(bulkOps);
          console.log(`everyDayCheckROIToLevelPaidMiddleware: User ROI bulk operations completed for ${loopDateString}.`);
        } else {
          console.log(`everyDayCheckROIToLevelPaidMiddleware: No user ROI bulk operations to execute for ${loopDateString}.`);
        }

        if (sponsorOps.length > 0) {
          const finalSponsorOps = mergeSponsorOps(sponsorOps);
          console.log(`everyDayCheckROIToLevelPaidMiddleware: Executing ${finalSponsorOps.length} sponsor ROI bulk operations for ${loopDateString}.`);
          await UserModel.bulkWrite(finalSponsorOps);
          console.log(`everyDayCheckROIToLevelPaidMiddleware: Sponsor ROI bulk operations completed for ${loopDateString}.`);
        } else {
          console.log(`everyDayCheckROIToLevelPaidMiddleware: No sponsor ROI bulk operations to execute for ${loopDateString}.`);
        }
      }

      // Mark as checked
      await AdminModel.updateOne(
        { _id: admin._id },
        { $set: { [`everyDayCheckROIToLevelPaid.${loopDateString}`]: true } }
      );
      admin.everyDayCheckROIToLevelPaid.set(loopDateString, true);
      console.log(`everyDayCheckROIToLevelPaidMiddleware: Marked ${loopDateString} as processed.`);
    }

    console.log("everyDayCheckROIToLevelPaidMiddleware: All daily ROI checks completed successfully.");
    next();
  } catch (err) {
    console.error("everyDayCheckROIToLevelPaidMiddleware: Error in ROI middleware:", err);
    next(); // still continue so user profile loads
  }
};

export default everyDayCheckROIToLevelPaidMiddleware;
