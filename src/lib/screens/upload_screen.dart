import 'dart:io';
import 'package:flutter/material.dart';
import 'package:firebase_storage/firebase_storage.dart';

class UploadScreen extends StatefulWidget {
  final String section;
  final String jobNumber;
  final List<File> images;

  const UploadScreen({
    super.key,
    required this.section,
    required this.jobNumber,
    required this.images,
  });

  @override
  State<UploadScreen> createState() => _UploadScreenState();
}

class _UploadScreenState extends State<UploadScreen> {
  bool isUploading = false;
  double uploadProgress = 0;

  Future<void> uploadImages() async {
    setState(() {
      isUploading = true;
      uploadProgress = 0;
    });

    final storage = FirebaseStorage.instance;
    int total = widget.images.length;

    for (int i = 0; i < total; i++) {
      String fileName =
          "${widget.jobNumber}_${widget.section.replaceAll(" ", "_")}_${i + 1}.jpg";

      String path =
          "jobs/${widget.jobNumber}/${widget.section.replaceAll(" ", "_")}/$fileName";

      File file = widget.images[i];

      try {
        UploadTask task = storage.ref(path).putFile(file);

        task.snapshotEvents.listen((snapshot) {
          double progress =
              snapshot.bytesTransferred / snapshot.totalBytes;

          setState(() {
            uploadProgress = ((i + progress) / total);
          });
        });

        await task;
      } catch (e) {
        print("Upload error: $e");
      }
    }

    setState(() {
      isUploading = false;
    });

    String shareLink = "https://nvts.app/job/${widget.jobNumber}";
    print("Share Link: $shareLink");

    Navigator.pop(context, widget.images.length);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.section),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            ElevatedButton(
              onPressed: isUploading ? null : uploadImages,
              child: const Text("Upload"),
            ),

            const SizedBox(height: 20),

            if (isUploading) ...[
              LinearProgressIndicator(value: uploadProgress),
              const SizedBox(height: 10),
              Text("${(uploadProgress * 100).toStringAsFixed(0)}%"),
            ]
          ],
        ),
      ),
    );
  }
}