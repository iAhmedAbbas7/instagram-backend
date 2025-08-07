// <= IMPORTS =>
import mongoose from "mongoose";

// <= SCHEMA =>
const Schema = mongoose.Schema;

// <= DISPLAY & ACCESSIBILITY SCHEMA =>
const DisplayAccessibilitySchema = new Schema(
  {
    language: { type: String, default: "en" },
    closedCaptions: { type: Boolean, default: false },
    units: { type: String, enum: ["METRIC", "IMPERIAL"], default: "METRIC" },
    theme: {
      type: String,
      enum: ["LIGHT", "DARK", "SYSTEM"],
      default: "SYSTEM",
    },
  },
  { _id: false }
);

// <= CONTENT PREFERENCES SCHEMA =>
const ContentPreferencesSchema = new Schema(
  {
    autoAdvanceReels: { type: Boolean, default: true },
    captionDefaults: { type: Boolean, default: false },
    autoAdvanceStories: { type: Boolean, default: true },
    sensitiveContentControl: {
      type: String,
      enum: ["ALLOW", "LIMIT", "HIDE"],
      default: "LIMIT",
    },
  },
  { _id: false }
);

// <= NOTIFICATION SETTINGS SCHEMA =>
const NotificationSettingsSchema = new Schema(
  {
    // POSTS, STORIES & COMMENTS
    likes: { type: Boolean, default: true },
    comments: { type: Boolean, default: true },
    mentions: { type: Boolean, default: true },
    storyReplies: { type: Boolean, default: true },
    // FOLLOWING & FOLLOWERS
    newFollowers: { type: Boolean, default: true },
    friendSuggestions: { type: Boolean, default: false },
    // DIRECT MESSAGES
    videoChats: { type: Boolean, default: true },
    directMessages: { type: Boolean, default: true },
    messageRequests: { type: Boolean, default: true },
    // LIVE & REELS
    liveVideos: { type: Boolean, default: true },
    reelsRemixes: { type: Boolean, default: false },
    // REMINDERS & BADGES
    eventReminders: { type: Boolean, default: false },
    fundraiserBadges: { type: Boolean, default: false },
    // PRODUCT ANNOUNCEMENTS
    productAnnouncements: { type: Boolean, default: true },
  },
  { _id: false }
);

// <= PRIVACY INTERACTION SCHEMA =>
const PrivacyInteractionSchema = new Schema(
  {
    accountPrivate: { type: Boolean, default: false },
    showActivityStatus: { type: Boolean, default: false },
    // STORY
    hideStoryFrom: [{ type: Schema.Types.ObjectId, ref: "User" }],
    storyReplies: {
      type: String,
      enum: ["EVERYONE", "FOLLOWERS", "OFF"],
      default: "FOLLOWERS",
    },
    // CLOSE FRIENDS
    closeFriends: [{ type: Schema.Types.ObjectId, ref: "User" }],
    // ACCOUNTS CONTROL
    mutedAccounts: [{ type: Schema.Types.ObjectId, ref: "User" }],
    blockedAccounts: [{ type: Schema.Types.ObjectId, ref: "User" }],
    restrictedAccounts: [{ type: Schema.Types.ObjectId, ref: "User" }],
    // COMMENTS
    filteredKeywords: [{ type: String }],
    hideOffensiveComments: { type: Boolean, default: false },
    commentsEnabledFor: {
      type: String,
      enum: ["EVERYONE", "FOLLOWERS", "OFF"],
      default: "EVERYONE",
    },
    // MENTIONS & TAGS
    tagsFrom: {
      type: String,
      enum: ["EVERYONE", "FOLLOWERS", "OFF"],
      default: "EVERYONE",
    },
    mentionsFrom: {
      type: String,
      enum: ["EVERYONE", "FOLLOWERS", "OFF"],
      default: "EVERYONE",
    },
    // CONTACTS & APPS
    contactSync: { type: Boolean, default: false },
    authorizedApps: [{ name: String, appId: String, connectedAt: Date }],
  },
  { _id: false }
);

// <= SECURITY SETTINGS SCHEMA =>
const SecuritySettingsSchema = new Schema(
  {
    emailFromInstagram: [{ type: String }],
    changePassword: { type: Boolean, default: true },
    twoFactorAuth: {
      enabled: { type: Boolean, default: false },
      methods: {
        type: String,
        enum: ["SMS", "AUTHENTICATOR_APP", "BACKUP_CODES"],
      },
    },
    loginActivity: [
      { ip: String, device: String, location: String, lastActive: Date },
    ],
    savedLoginInfo: { type: Boolean, default: false },
    advancedProtection: { type: Boolean, default: false },
  },
  { _id: false }
);

// <= AD SETTINGS SCHEMA =>
const AdSettingsSchema = new Schema(
  {
    adTopics: [{ type: String }],
    adPreferences: [{ type: String }],
    dataPermissions: { type: Boolean, default: true },
  },
  { _id: false }
);

// <= ACCOUNT SETTING SCHEMA =>
const AccountSettingsSchema = new Schema(
  {
    personalInfo: {
      fullName: String,
      username: String,
      phoneNumber: String,
      birthday: { type: Date },
      email: { type: String },
    },
    currency: { type: String, default: "USD" },
    originalPhotos: { type: Boolean, default: true },
    linkedAccounts: [{ platform: String, connected: Boolean }],
    accountType: {
      type: String,
      enum: ["PERSONAL", "BUSINESS", "CREATOR"],
      default: "PERSONAL",
    },
  },
  { _id: false }
);

// <= PAYMENT SETTINGS SCHEMA =>
const PaymentSettingsSchema = new Schema(
  {
    badges: [{ type: String }],
    paymentMethods: [{ type: String }],
    subscriptions: { type: Boolean, default: false },
    shoppingPreferences: {
      checkout: { type: Boolean, default: true },
      savedCards: [{ type: String }],
    },
  },
  { _id: false }
);

// <= CREATOR TOOLS SCHEMA =>
const CreatorToolsSchema = new Schema(
  {
    promotionAccess: { type: Boolean, default: false },
    subscriptionFeatures: { type: Boolean, default: false },
    professionalDashboard: { type: Boolean, default: false },
    brandedContentApproval: { type: Boolean, default: false },
  },
  { _id: false }
);

// <= SUPPORT SETTINGS SCHEMA =>
const SupportSettingsSchema = new Schema(
  {
    viewLegal: { type: Boolean, default: true },
    helpCenter: { type: Boolean, default: true },
    downloadData: { type: Boolean, default: false },
    reportProblem: { type: Boolean, default: true },
  },
  { _id: false }
);

// <= MAIN SETTINGS SCHEMA =>
const SettingsSchema = new Schema({
  ads: AdSettingsSchema,
  support: SupportSettingsSchema,
  accounts: AccountSettingsSchema,
  payments: PaymentSettingsSchema,
  security: SecuritySettingsSchema,
  creatorTools: CreatorToolsSchema,
  notifications: NotificationSettingsSchema,
  contentPreferences: ContentPreferencesSchema,
  privacyInteractions: PrivacyInteractionSchema,
  displayAccessibility: DisplayAccessibilitySchema,
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    unique: true,
    required: true,
  },
});

// <= EXPORTING THE USER SCHEMA =>
export const Settings = mongoose.model("Settings", SettingsSchema);
