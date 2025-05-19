const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { createClient } = require("@supabase/supabase-js");
const eslint = require("eslint");

// Import Supabase client from supabase.js
const { supabase } = require("./supabase"); // Adjust the path if needed

admin.initializeApp();

// HTTP function to be triggered by Supabase Webhooks
exports.detectBugs = functions.https.onRequest(async (req, res) => {
    try {
        if (req.method !== "POST") {
            return res.status(405).send("Method Not Allowed");
        }

        const { path } = req.body; // Supabase sends file path in request body
        if (!path) {
            return res.status(400).send("Missing file path in request.");
        }

        const fileName = path.split("/").pop();

        // Read file from Supabase Storage
        const { data, error } = await supabase.storage.from("bug").download(path);
        if (error) throw new Error("Error fetching file from Supabase: " + error.message);

        const fileContent = await data.text();

        // Run ESLint to detect bugs
        const linter = new eslint.ESLint();
        const results = await linter.lintText(fileContent);

        // Extract bug data
        const bugs = results.flatMap(result =>
            result.messages.map(msg => ({
                file_name: fileName,
                file_path: path,
                line_number: msg.line || 0,
                error_message: msg.message
            }))
        );

        if (bugs.length === 0) {
            console.log("No bugs detected in the uploaded file.");
            return res.status(200).send("No bugs detected.");
        }

        // Insert bugs into Supabase database
        const { error: insertError } = await supabase.from("bugs").insert(bugs);
        if (insertError) throw new Error("Error inserting bugs into Supabase: " + insertError.message);

        console.log("Bug tracking information stored successfully.");
        res.status(200).send("Bug tracking data stored successfully.");
    } catch (err) {
        console.error("Error in bug detection function:", err);
        res.status(500).send("Internal Server Error: " + err.message);
    }
});
