// <= IMPORTS =>
import cron from "node-cron";
import cloudinary from "../utils/cloudinary.js";
import { Story } from "../models/story.model.js";
import { StoryView } from "../models/storyView.model.js";
import { FailedDeletion } from "../models/failedDeletion.model.js";

/**
 * STORY CLEANUP JOB
 * - BEHAVIOR / CONFIGURATION VIA ENVIRONMENT
 * - CLEANUP_ENABLED - WHETHER THE JOB STARTS ON SERVER BOOT
 * - CLEANUP_STRICT - ONLY DELETE STORIES AFTER STORY MEDIA IS DESTROYED
 * - DELETION_ATTEMPTS - TIMES TO RETRY TO BEFORE GIVING UP
 * - RETRY_BASE_MINUTES - BASE BACKOFF MINUTES BEFORE EACH RETRY
 * - RETRY_MAX_MINUTES - CAP BACKOFF MINUTES (DEFAULTS TO 24 HRS)
 * @exports
 * - startStoryCleanup() - SCHEDULES EVERY FIVE MINUTES
 * - runStoryCleanupOnce() - RUN THE JOB IMMEDIATELY (SCRIPTS/TESTS)
 */
// <= CONFIG WITH SENSIBLE DEFAULTS =>
const DELETION_ATTEMPTS = parseInt(process.env.DELETE_ATTEMPTS || "5", 10);
const RETRY_BASE_MINUTES = parseInt(process.env.RETRY_BASE_MINUTES || "5", 10);
const RETRY_MAX_MINUTES = parseInt(process.env.RETRY_MAX_MINUTES || "1440", 10);
const STRICT = (process.env.CLEANUP_STRICT || "false").toLowerCase() === "true";

// <= STORY CLEANUP RUNNING FLAG =>
let _storyCleanupRunning = false;

/**
 * HELPER FUNCTION TO DETERMINE THE RESOURCE TYPE OF THE MEDIA
 * - RESOURCE TYPE - IMAGE OR VIDEO SAVED WHILE CREATING STORY IN MEDIA
 */
const pickResourceTypeFromMediaType = (mediaType) => {
  // IF NO MEDIA TYPE THEN RETURNING IMAGE AS DEFAULT
  if (!mediaType || typeof mediaType !== "string") return "IMAGE";
  // CHECKING THE TYPE OF PROVIDED MEDIA TYPE VALUE
  const type = mediaType.toUpperCase();
  // IF TYPE IS VIDEO
  if (type === "VIDEO") return "VIDEO";
  // OTHERWISE RETURN IMAGE
  return "IMAGE";
};

/**
 * HELPER FUNCTION TO MAP STORED ENUM TO CLOUDINARY RESOURCE TYPE
 * - STORED MEDIA TYPE (IMAGE/VIDEO) = CLOUDINARY RESOURCE TYPE (image/video)
 */
const mapEnumToCloudResourceType = (enumString) => {
  // IF NO ENUM STRING THEN RETURNING IMAGE AS DEFAULT
  if (!enumString || typeof enumString !== "string") return "image";
  // CHECKING THE TYPE OF PROVIDED MEDIA TYPE VALUE
  const type = enumString.toUpperCase();
  // IF TYPE IS VIDEO
  if (type === "VIDEO") return "video";
  // OTHERWISE RETURN IMAGE
  return "image";
};

/**
 * HELPER FUNCTION TO INTERPRET CLOUDINARY DESTROY RESPONSE
 * - SUCCESS OR FAILURE
 */
const cloudDestroySucceeded = (response) => {
  // IF NO RESPONSE FOUND
  if (!response) return false;
  // SETTING CLOUD RESPONSE
  const cloudResponse = response.result || response;
  // RETURNING THE CLOUD RESPONSE
  return (
    cloudResponse === "ok" ||
    cloudResponse === "deleted" ||
    cloudResponse === "not found"
  );
};

/**
 * HELPER FUNCTION TO UPSERT/SCHEDULE FAILED DELETION
 */
const enqueueFailedDeletion = async ({
  publicId,
  resourceTypeEnum,
  storyId,
  errMessage,
}) => {
  try {
    // FINDING THE EXISTING FAILED DELETIONS IF ANY
    const existingFailed = await FailedDeletion.findOne({ publicId }).exec();
    // SETTING CURRENT TIME
    const now = new Date();
    // IF EXISTING FAILED DELETIONS FOUND
    if (existingFailed) {
      // IF WE HAVE HIT THE ATTEMPTS CAP THEN, RETURNING THE FAILED
      if (existingFailed.attempts >= DELETION_ATTEMPTS) {
        // LOGGING MESSAGE
        console.warn(
          `Max Deletion Attempts Reached for`,
          publicId,
          "Skipping further Retries"
        );
        // UPDATING THE LAST ERROR
        existingFailed.lastError = errMessage
          ? String(errMessage).slice(0, 1024)
          : existingFailed.lastError;
        // SETTING THE NEXT ATTEMPT OF FAILED
        existingFailed.nextAttemptAt = existingFailed.nextAttemptAt || now;
        // SAVING THE EXISTING FAILED
        await existingFailed.save();
        // RETURNING
        return existingFailed;
      }
      // INCREMENTING THE ATTEMPT FOR THE EXISTING ENTRY
      const attempts = existingFailed.attempts + 1;
      // CALCULATING THE BACKOFF MINUTES
      const backOffMinutes = Math.min(
        RETRY_BASE_MINUTES * 2 ** attempts,
        RETRY_MAX_MINUTES
      );
      // SETTING THE TIME FOR NEXT ATTEMPT
      const nextAttemptAt = new Date(
        now.getTime() + backOffMinutes * 60 * 1000
      );
      // UPDATING THE ATTEMPTS OF THE FAILED
      existingFailed.attempts = attempts;
      // UPDATING THE LAST ERROR OF THE FAILED
      existingFailed.lastError = errMessage
        ? String(errMessage).slice(0, 1024)
        : "";
      // SETTING THE NEXT ATTEMPT OF FAILED
      existingFailed.nextAttemptAt = nextAttemptAt;
      // IF STORY ID EXISTS, THEN SETTING IT FOR FAILED
      if (storyId) existingFailed.storyId = existingFailed.storyId || storyId;
      // ENSURING THE STORED RESOURCE TYPE IS SET, PRESERVING IF PRESENT
      existingFailed.resourceType =
        existingFailed.resourceType || resourceTypeEnum || "IMAGE";
      // SAVING THE EXISTING FAILED
      await existingFailed.save();
      // RETURNING
      return existingFailed;
    }
    // IF NOT WAS ALREADY IN THE FAILED DELETION ENQUEUE
    else {
      // INITIATING ATTEMPTS
      const attempts = 1;
      // CALCULATING THE BACKOFF MINUTES
      const backOffMinutes = Math.min(
        RETRY_BASE_MINUTES * 2 ** attempts,
        RETRY_MAX_MINUTES
      );
      // SETTING THE TIME FOR NEXT ATTEMPT
      const nextAttemptAt = new Date(
        now.getTime() + backOffMinutes * 60 * 1000
      );
      // CREATING THE FAILED DELETION DOCUMENT
      const failedDeletion = await FailedDeletion.create({
        publicId,
        attempts,
        nextAttemptAt,
        storyId: storyId || null,
        resourceType: resourceTypeEnum || "IMAGE",
        lastError: errMessage ? String(errMessage).slice(0, 1024) : "",
      });
      // RETURNING
      return failedDeletion;
    }
  } catch (err) {
    // LOGGING ERROR MESSAGE
    console.error(
      "Failed to Enqueue Failed Deletion for",
      publicId,
      err.message || err
    );
  }
};

/**
 * HELPER TO DELETE A SINGLE MEDIA ASSET FROM CLOUDINARY
 * @param {Object} - THE MEDIA OBJECT
 * @returns {Boolean} - OK/TRUE ON SUCCESS OR ERR/FALSE ON FAILURE
 */
const tryDeleteMedia = async (media) => {
  // IF NO MEDIA OR MEDIA PUBLIC ID FOUND
  if (!media || !media.publicId) return { ok: true };
  // DETERMINING THE STORED MEDIA ENUM
  const storedMediaEnum = pickResourceTypeFromMediaType(media.type);
  // DETERMINING THE CLOUD RESOURCE TYPE
  const cloudResourceType = mapEnumToCloudResourceType(storedMediaEnum);
  // ATTEMPTING TO DELETE
  try {
    // AWAITING CLOUD DESTROY RESPONSE
    const destroyResponse = await cloudinary.uploader.destroy(media.publicId, {
      resource_type: cloudResourceType,
    });
    // CHECKING FOR THE CLOUDINARY RESPONSE TO BE OK
    if (cloudDestroySucceeded(destroyResponse)) {
      // RETURNING OK
      return { ok: true, destroyResponse };
    } else {
      return {
        ok: false,
        err: `Cloud Destroy returns unexpected Response : ${JSON.stringify(
          destroyResponse
        )}`,
      };
    }
  } catch (err) {
    // RETURNING ERROR
    return { ok: false, err: err.message || String(err) };
  }
};

/**
 * CORE STORY CLEANUP JOB LOGIC (RUN ONCE)
 */
const runCleanupOnceInternal = async () => {
  // AVOIDING THE OVERLAPPING CLEANUP JO RUNS
  if (_storyCleanupRunning) {
    // LOGGING MESSAGE
    console.log("Story Cleanup Job in Progress - Skipping this Run!");
    return;
  }
  // SETTING THE FLAG OF CLEANUP JOB
  _storyCleanupRunning = true;
  // ATTEMPTING CLEANUP
  try {
    // SETTING THE CURRENT TIME
    const now = new Date();
    // FINDING THE EXPIRED STORIES FOR CLEANUP
    const expiredStories = await Story.find({
      expiresAt: { $lte: now },
    }).lean();
    // IF NO EXPIRED STORIES FOUND
    if (!expiredStories || expiredStories.length === 0) {
      // LOGGING MESSAGE
      console.log("No Expired Stories Found!");
    } else {
      console.log(
        `Story Cleanup Found ${expiredStories.length} expired ${
          expiredStories.length === 1 ? "Story" : "Stories"
        }`
      );
    }
    // ATTEMPTING TO DELETE EACH STORY MEDIA AND ENQUEUE FAILURES
    for (const story of expiredStories) {
      // LOOPING OVER STORY MEDIAS
      for (const media of story.medias || []) {
        // IF NO MEDIA OR PUBLIC ID OF MEDIA FOUND
        if (!media || !media.publicId) continue;
        // ATTEMPTING MEDIA DELETION
        const response = tryDeleteMedia(media);
        // IF RESPONSE WAS NOT OK
        if (!response.ok) {
          // GETTING THE STORED MEDIA TYPE TO ENQUEUE FAILED DELETIONS
          const storedEnum = pickResourceTypeFromMediaType(media.type);
          // ATTEMPTING THE DELETION FROM ENQUEUE
          await enqueueFailedDeletion({
            storyId: story._id,
            publicId: media.publicId,
            errMessage: response.err,
            resourceTypeEnum: storedEnum,
          });
          // LOGGING MESSAGE
          console.error(
            "Failed to Delete Media - (Enqueued) : ",
            media.publicId,
            response.err
          );
        } else {
          // IF NO ERROR, DELETING ANY EXISTING RECORD FOR THIS MEDIA
          try {
            await FailedDeletion.deleteOne({ publicId: media.publicId }).exec();
          } catch (e) {
            // LOGGING ERROR MESSAGE
            console.warn(
              "Failed to Remove possible existing Failed Deletion",
              media.publicId,
              e.message || e
            );
          }
        }
      }
    }
    // PROCESSING PENDING FAILED DELETIONS THAT ARE DUE FOR RETRY
    const pending = await FailedDeletion.find({ nextAttemptAt: { $lte: now } })
      .limit(200)
      .lean();
    // IF PENDING DELETIONS FOUND
    if (pending || pending.length > 0) {
      // LOGGING MESSAGE
      console.log(
        `Story Cleanup Processing ${pending.length} pending Failed Deletions!`
      );
      // ATTEMPTING FAILED DELETION
      for (const failed of pending) {
        try {
          // GETTING THE RESOURCE TYPE FOR CLOUD DESTROY
          const cloudResourceType = mapEnumToCloudResourceType(
            failed.resourceType
          );
          // AWAITING CLOUDINARY DESTROY RESPONSE
          const destroyResponse = await cloudinary.uploader.destroy(
            failed.publicId,
            { resource_type: cloudResourceType }
          );
          // IF DESTROY RESPONSE OK
          if (cloudDestroySucceeded(destroyResponse)) {
            // REMOVING THE FAILED DELETION FROM THE QUEUE
            await FailedDeletion.deleteOne({ _id: failed._id }).exec();
            // LOGGING MESSAGE
            console.log(
              "Retry Succeeded, Failed Deletion Successful!",
              failed.publicId
            );
          } else {
            // TREATING AS FAILURE AND RE-ENQUEUE WITH INCREMENTING ATTEMPTS
            await enqueueFailedDeletion({
              storyId: failed.storyId,
              publicId: failed.publicId,
              resourceTypeEnum: failed.resourceType,
              errMessage: `retryResponse:${JSON.stringify(destroyResponse)}`,
            });
            // LOGGING MESSAGE
            console.warn(
              "Retry returned non-ok Response",
              failed.publicId,
              destroyResponse
            );
          }
        } catch (err) {
          // ENQUEUING FOR FAILED DELETION
          await enqueueFailedDeletion({
            storyId: failed.storyId,
            publicId: failed.publicId,
            resourceTypeEnum: failed.resourceType,
            errMessage: err.message || String(err),
          });
          // LOGGING MESSAGE
          console.error(
            "Retry Deletion Failed for",
            failed.publicId,
            err.message || err
          );
        }
      }
    }
    // DECIDING WHICH STORY DOCUMENTS TO REMOVE
    const expiredIds = expiredStories.map((s) => s._id);
    // IF NO EXPIRED STORY DOCUMENTS
    if (expiredIds.length === 0) {
      return;
    }
    // CHECKING IF STRICT CLEANUP FLAG IS SET
    if (STRICT) {
      // BUILDING THE LIST OF ALL PUBLIC ID'S AND CHECKING FOR BLOCKED FAILED DELETIONS
      const allPublicIds = [];
      // LOOPING OVER EACH STORY DOCUMENT
      for (const story of expiredStories) {
        // LOOPING OVER MEDIA OF EACH STORY DOCUMENT
        for (const media of story.medias || []) {
          // PUSHING THE PUBLIC ID'S IN ARRAY
          if (media && media.publicId) allPublicIds.push(media.publicId);
        }
      }
      // FINDING THE BLOCKING FAILED DELETIONS
      const blocking = await FailedDeletion.find({
        publicId: { $in: allPublicIds },
      }).lean();
      // IF BLOCKING DELETIONS FOUND
      if (blocking && blocking.length > 0) {
        // GETTING THE PUBLIC ID'S OF BLOCKING DELETIONS
        const blockedPublicIds = blocking.map((b) => b.publicId);
        // SETTING DELETEABLE STORY ID'S
        const deleteableStoryIds = expiredStories
          .filter((s) => {
            // PUBLIC ID'S
            const pids = (s.medias || [])
              .map((m) => (m && m.publicId) || null)
              .filter(Boolean);
            return pids.every((pid) => !blockedPublicIds.includes(pid));
          })
          .map((s) => s._id);
        // IF DELETEABLE STORIES FOUND
        if (deleteableStoryIds.length > 0) {
          // ATTEMPTING STORY DELETION
          await Story.deleteMany({ _id: { $in: deleteableStoryIds } }).exec();
          // ATTEMPTING STORY VIEW DELETION
          await StoryView.deleteMany({
            story: { $in: deleteableStoryIds },
          }).exec();
          // LOGGING MESSAGE
          console.log(
            `Story Cleanup Strict Mode : Removed ${deleteableStoryIds.length} Stories (Others Blocked)!`
          );
        } else {
          // LOGGING MESSAGE
          console.log(
            "Story Cleanup Strict Mode : No Story Docs Removed because Deletions are still Pending!"
          );
        }
      } else {
        // ATTEMPTING STORY DELETION
        await Story.deleteMany({ _id: { $in: expiredIds } }).exec();
        // ATTEMPTING STORY VIEW DELETION
        await StoryView.deleteMany({
          story: { $in: expiredIds },
        }).exec();
        // LOGGING MESSAGE
        console.log(
          `Story Cleanup Strict Mode : Removed ${expiredIds.length} Stories!`
        );
      }
    } else {
      // NON-STRICT MODE - DELETING ALL EXPIRED DOCS REGARDLESS OF FAILURES
      await Story.deleteMany({ _id: { $in: expiredIds } }).exec();
      // ATTEMPTING STORY VIEW DELETION
      await StoryView.deleteMany({
        story: { $in: expiredIds },
      }).exec();
      // LOGGING MESSAGE
      console.log(
        `Story Cleanup Non-Strict Mode : Removed ${expiredIds.length} Stories!`
      );
    }
  } catch (err) {
    console.error(
      "Story Cleanup Run Failed",
      err && err.message ? err.message : err
    );
  } finally {
    // RESETTING THE CLEANUP RUNNING FLAG
    _storyCleanupRunning = false;
  }
};

/**
 * SCHEDULER STARTER (RUNS EVERY 5 MINUTES)
 */
export const startStoryCleanup = () => {
  // CRON SCHEDULE
  cron.schedule(
    "*/5 * * * *",
    async () => {
      await runCleanupOnceInternal();
    },
    { timezone: process.env.CRON_TZ || "UTC" }
  );
  // RUNNING LOG MESSAGE
  console.log("Story Cleanup Schedule to run every 5 Minutes!");
};

/**
 * RUN THE CLEANUP IMMEDIATELY
 * - TESTING/SCRIPTS
 */
export const runStoryCleanupOnce = async () => {
  await runCleanupOnceInternal();
};
