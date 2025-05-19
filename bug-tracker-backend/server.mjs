import "dotenv/config"; // ✅ Fix dotenv import

import express from "express";
import cors from "cors";
import multer from "multer";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json()); // ✅ Allow JSON parsing in requests

// ✅ Configure Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ✅ Set up file storage middleware
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ AI Bug Analysis Function
const analyzeCodeAI = async (code) => {
    try {
        const response = await fetch(
            "https://api-inference.huggingface.co/models/bigcode/starcoder",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ inputs: code }),
            }
        );

        if (!response.ok) {
            throw new Error(`AI API Error: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("❌ AI Analysis Error:", error.message);
        return { error: "Failed to analyze code" };
    }
};



// ✅ Upload & Analyze Bugs
app.post("/bug", upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        const fileName = `bug/${Date.now()}_${req.file.originalname}`;

        // ✅ Upload file to Supabase Storage
        const { data, error } = await supabase.storage.from("bug").upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype,
        });

        if (error) throw new Error(`File upload failed: ${error.message}`);

        // ✅ Get Public URL
        const { publicUrl } = supabase.storage.from("bug").getPublicUrl(fileName);
        const fileUrl = publicUrl || null;

        // ✅ Extract Code & Analyze Using AI
        const fileContent = req.file.buffer.toString();
        const aiAnalysis = await analyzeCodeAI(fileContent);

        // ✅ Ensure AI response is valid
        const errorMessage = aiAnalysis?.[0]?.label || "No issues detected";
        const confidence = aiAnalysis?.[0]?.score || 0;

        // ✅ Store AI Analysis in Supabase
        const bugData = {
            file_name: req.file.originalname,
            file_url: fileUrl,
            error_message: errorMessage,
            confidence: confidence,
            created_at: new Date().toISOString(),
        };

        const { error: dbError } = await supabase.from("bug").insert([bugData]);

        if (dbError) throw new Error(`Database insert failed: ${dbError.message}`);

        res.status(200).json({ message: "File uploaded successfully", aiAnalysis, fileUrl });
    } catch (err) {
        console.error("❌ Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ✅ Start the Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
