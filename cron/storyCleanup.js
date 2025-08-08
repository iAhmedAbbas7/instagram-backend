// <= IMPORTS =>
import cron from "node-cron";
import cloudinary from "../utils/cloudinary.js";
import { Story } from "../models/story.model.js";
import { StoryView } from "../models/storyView.model.js";

/**
 * RUNS EVERY FIVE MINUTES
 * - FINDS EXPIRED USER STORIES
 * - DELETES CLOUDINARY STORY MEDIA
 * - DELETES STORY & STORY VIEW DOCUMENTS FROM THE DATABASE
 */
// <= STORY CLEANUP MAIN FUNCTION =>
export const startStoryCleanup = () => {
  // RUNS EVERY FIVE MINUTES
  cron.schedule(
    "*/5 * * * *",
    async () => {
      // STARTING THE CLEANUP JOB
      try {
        // SETTING THE CURRENT TIME
        const now = new Date();
        // GETTING THE EXPIRED STORIES
        const expiredStories = await Story.find({
          expiresAt: { $lte: now },
        }).lean();
        // IF THERE ARE NO EXPIRED STORIES YET, THEN RETURNING
        if (!expiredStories || expiredStories.length === 0) return;
        // IF THERE ARE EXPIRED STORIES
        for (const s of expiredStories) {
          // LOOPING OVER STORY MEDIA
          for (const m of s.medias) {
            try {
              // IF MEDIA PUBLIC ID EXISTS
              if (m.publicId) {
                // DELETING THE MEDIA FROM CLOUDINARY
                await cloudinary.uploader.destroy(m.publicId, {
                  resource_type: "auto",
                });
              }
            } catch (err) {
              console.error(
                "Failed to Delete Cloudinary Asset!",
                m.publicId,
                err
              );
            }
          }
        }
        // GETTING THE EXPIRED STORY IDS
        const expiredIds = expiredStories.map((x) => x._id);
        // DELETING THE STORY DOCUMENTS
        await Story.deleteMany({ _id: { $in: expiredIds } });
        // DELETING THE STORY VIEW DOCUMENTS
        await StoryView.deleteMany({ story: { $in: expiredIds } });
        // LOGGING SUCCESS MESSAGE
        console.log(`Story Cleanup: Removed ${expiredIds.length} Stories!`);
      } catch (err) {
        // LOGGING ERROR MESSAGE
        console.error("Stroy Cleanup Failed!", err.message);
      }
    },
    { timezone: process.env.CRON_TZ || "UTC" }
  );
};
