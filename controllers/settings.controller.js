// <= IMPORTS =>
import { User } from "../models/user.model.js";
import { Settings } from "../models/settings.model.js";
import expressAsyncHandler from "express-async-handler";

// <= GET ALL SETTINGS =>
export const getAllSettings = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER
  const userId = req.id;
  // FINDING USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // FINDING SETTING FOR THE USER
  const settings = await Settings.findOneAndUpdate(
    { user: userId },
    {
      $setOnInsert: {
        ads: {},
        support: {},
        accounts: {},
        payments: {},
        security: {},
        creatorTools: {},
        notifications: {},
        contentPreferences: {},
        privacyInteractions: {},
        displayAccessibility: {},
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true,
    }
  )
    .lean()
    .exec();
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, settings });
});

// <= PATCH SETTINGS =>
export const updateSettingsSection = expressAsyncHandler(async (req, res) => {
  // GETTING CURRENT LOGGED IN USER
  const userId = req.id;
  // GETTING UPDATED SECTION DATA FROM REQUEST BODY
  const updates = req.body;
  // GETTING SECTION TO BE UPDATED FROM REQUEST PARAMS
  const section = req.params.section;
  // FINDING USER IN THE USER MODEL THROUGH USER ID
  const foundUser = await User.findById(userId).exec();
  // IF USER NOT FOUND
  if (!foundUser) {
    return res.status(404).json({ message: "User Not Found!", success: false });
  }
  // WHITELISTING THE ALLOWED SECTIONS
  const allowedSections = [
    "ads",
    "support",
    "accounts",
    "payments",
    "security",
    "creatorTools",
    "notifications",
    "contentPreferences",
    "privacyInteractions",
    "displayAccessibility",
  ];
  // IF SECTION IS NOT WHITELISTED
  if (!allowedSections.includes(section)) {
    return res
      .status(400)
      .json({ message: "Invalid Settings Action!", success: false });
  }
  // FINDING THE SETTINGS SECTION & UPDATING
  const settings = await Settings.findOneAndUpdate(
    { user: userId },
    { $set: { [section]: updates } },
    { new: true, runValidators: true }
  ).exec();
  // RETURNING RESPONSE
  return res.status(200).json({ success: true, settings });
});
