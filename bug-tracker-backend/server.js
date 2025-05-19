import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());

// ✅ Configure Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ✅ Set up file storage middleware
const storage = multer.memoryStorage();
const uploadSingle = multer({ storage }).single("file"); // For single file
const uploadMultiple = multer({ storage }).array("files"); // For multiple files

// ✅ Bug patterns for detection
const bugPatterns = [
    { type: "Syntax Error", regex: /SyntaxError|unexpected token|missing/i, fix: "Check syntax and missing characters." },
    { type: "Reference Error", regex: /ReferenceError|undefined variable/i, fix: "Ensure variables and functions are defined before use." },
    { type: "Logical Error", regex: /divide by zero|infinite loop/i, fix: "Fix incorrect logic and loop conditions." },
    { type: "Workflow Issue", regex: /deprecated|unhandled promise/i, fix: "Update deprecated methods and handle promises properly." }
];

// ✅ Function to scan files for bugs
const scanFileForBugs = (fileContent, fileName, filePath, fileUrl) => {
    let detectedBugs = [];
    const lines = fileContent.split("\n");

    lines.forEach((line, index) => {
        bugPatterns.forEach((pattern) => {
            if (pattern.regex.test(line)) {
                detectedBugs.push({
                    file_name: fileName,
                    file_path: filePath,
                    file_url: fileUrl,
                    line_number: index + 1,
                    bug_type: pattern.type,
                    error_message: line.trim(),
                    suggested_fix: pattern.fix,
                    created_at: new Date().toISOString(),
                });
            }
        });
    });

    return detectedBugs;
};

// ✅ API for Single File Upload
app.post("/upload-file", uploadSingle, async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        const bucketName = "bug"; // ✅ Store single files in "bug"
        const fileName = `files/${Date.now()}_${req.file.originalname}`;
        
        console.log("📤 Uploading file:", fileName);

        // ✅ Upload file to Supabase Storage
        const { error } = await supabase.storage.from(bucketName).upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype,
        });

        if (error) throw new Error(`File upload failed: ${error.message}`);

        // ✅ Get Public URL
        const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
        const fileUrl = urlData?.publicUrl || null;

        // ✅ Scan for bugs
        const fileContent = req.file.buffer.toString();
        let detectedBugs = scanFileForBugs(fileContent, req.file.originalname, fileName, fileUrl);

        // ✅ Store detected bugs in Supabase Database
        if (detectedBugs.length > 0) {
            console.log(`⚠️ ${detectedBugs.length} Bugs detected in file.`);
            const { error: dbError } = await supabase.from("bug").insert(detectedBugs);
            if (dbError) throw new Error(`Database insert failed: ${dbError.message}`);
        }

        res.status(200).json({
            message: "✅ File uploaded successfully!",
            bugFound: detectedBugs.length > 0,
            fileUrl,
            detectedBugs
        });

    } catch (err) {
        console.error("❌ Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ✅ API for Folder Upload (Multiple Files)
app.post("/upload-folder", uploadMultiple, async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No folder uploaded" });
    }

    try {
        let uploadedFiles = [];
        let detectedBugs = [];
        const bucketName = "bugfolders"; // ✅ Store folders in "bugfolders"

        for (const file of req.files) {
            const fileName = `folders/${Date.now()}_${file.originalname}`;
            console.log("📤 Uploading file:", fileName);

            // ✅ Upload file to Supabase Storage
            const { error } = await supabase.storage.from(bucketName).upload(fileName, file.buffer, {
                contentType: file.mimetype,
            });

            if (error) throw new Error(`File upload failed: ${error.message}`);

            // ✅ Get Public URL
            const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
            const fileUrl = urlData?.publicUrl || null;
            uploadedFiles.push({ fileName, fileUrl });

            // ✅ Scan for bugs
            const fileContent = file.buffer.toString();
            detectedBugs.push(...scanFileForBugs(fileContent, file.originalname, fileName, fileUrl));
        }

        // ✅ Store detected bugs in Supabase database
        if (detectedBugs.length > 0) {
            console.log(`⚠️ ${detectedBugs.length} Bugs detected in folder.`);
            const { error: dbError } = await supabase.from("bug").insert(detectedBugs);
            if (dbError) throw new Error(`Database insert failed: ${dbError.message}`);
        }

        res.status(200).json({
            message: "✅ Folder uploaded successfully!",
            filesUploaded: uploadedFiles.length,
            bugsDetected: detectedBugs.length,
            uploadedFiles,
            detectedBugs
        });

    } catch (err) {
        console.error("❌ Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ✅ Start the Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
