import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'job_photo_screen.dart';

class JobEntryScreen extends StatefulWidget {
  const JobEntryScreen({super.key});

  @override
  State<JobEntryScreen> createState() => _JobEntryScreenState();
}

class _JobEntryScreenState extends State<JobEntryScreen> {
  final TextEditingController nameController = TextEditingController();
  final TextEditingController jobController = TextEditingController();

  // 🔥 SUBMIT FUNCTION
  Future<void> handleSubmit() async {
    String name = nameController.text.trim();
    String digits = jobController.text.trim();

    // ✅ NAME VALIDATION
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Enter your name")),
      );
      return;
    }

    if (name != name.toUpperCase()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Name must be in CAPITAL LETTERS")),
      );
      return;
    }

    // ✅ JOB VALIDATION
    if (digits.length != 7) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Enter exactly 7 digits")),
      );
      return;
    }

    String jobNumber = "NJ$digits";

    final storage = FirebaseStorage.instance;

    try {
      final result = await storage.ref("jobs/$jobNumber").listAll();

      if (result.items.isNotEmpty || result.prefixes.isNotEmpty) {
        // 🔥 JOB EXISTS
        showDialog(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text("Job Exists"),
            content: Text(
              "$jobNumber already exists.\n\nDo you want to update it or create new?",
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text("Cancel"),
              ),

              // UPDATE
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                  verifyJobNumber(jobNumber, name);
                },
                child: const Text("Update"),
              ),

              // NEW
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                  goToJob(jobNumber, name, false);
                },
                child: const Text("New Job"),
              ),
            ],
          ),
        );
      } else {
        goToJob(jobNumber, name, false);
      }
    } catch (e) {
      print("Error checking job: $e");
      goToJob(jobNumber, name, false);
    }
  }

  // 🔐 VERIFY
  void verifyJobNumber(String jobNumber, String name) {
    TextEditingController confirmController = TextEditingController();

    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("Verify Job Number"),
        content: TextField(
          controller: confirmController,
          decoration: const InputDecoration(
            labelText: "Re-enter full job number",
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("Cancel"),
          ),
          TextButton(
            onPressed: () {
              if (confirmController.text.trim() == jobNumber) {
                Navigator.pop(context);
                goToJob(jobNumber, name, true);
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text("Job number mismatch")),
                );
              }
            },
            child: const Text("Confirm"),
          ),
        ],
      ),
    );
  }

  // 🚀 NAVIGATION
  void goToJob(String jobNumber, String name, bool isUpdate) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => JobPhotoScreen(
          jobNumber: jobNumber,
          isUpdate: isUpdate,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("NVTS App v2.1"),
        centerTitle: true,
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 30),

            // 🔥 NAME FIELD
            const Text(
              "Enter Your Name",
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Colors.deepPurple,
              ),
            ),

            const SizedBox(height: 10),

            TextField(
              controller: nameController,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(
                hintText: "CAPITAL LETTERS ONLY",
                border: UnderlineInputBorder(),
              ),
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),

            const SizedBox(height: 30),

            // 🔥 JOB NUMBER
            const Text(
              "Enter Job Number",
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Colors.deepPurple,
              ),
            ),

            const SizedBox(height: 10),

            TextField(
              controller: jobController,
              keyboardType: TextInputType.number,
              maxLength: 7,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
              ],
              decoration: const InputDecoration(
                prefixText: "NJ",
                hintText: "Enter 7 digits",
                counterText: "",
                border: UnderlineInputBorder(),
              ),
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
              ),
            ),

            const SizedBox(height: 40),

            Center(
              child: ElevatedButton(
                onPressed: handleSubmit,
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 40,
                    vertical: 16,
                  ),
                ),
                child: const Text(
                  "Continue",
                  style: TextStyle(fontSize: 18),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}