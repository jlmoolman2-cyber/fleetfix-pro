import 'package:flutter/material.dart';
import 'upload_screen.dart'; // ✅ FIXED (this file must exist)

class JobPhotoScreen extends StatefulWidget {
  final String jobNumber;
  final bool isUpdate;

  const JobPhotoScreen({
    super.key,
    required this.jobNumber,
    required this.isUpdate,
  });

  @override
  State<JobPhotoScreen> createState() => _JobPhotoScreenState();
}

class _JobPhotoScreenState extends State<JobPhotoScreen> {
  final Map<String, int> required = {
    "Truck Photos": 5,
    "Trailer A Photos": 4,
    "Trailer B Photos": 4,
    "Before Photos": 3,
    "After Photos": 3,
    "Old Parts": 0,
    "New Parts": 0,
    "Diagnostics": 0,
  };

  final Map<String, int> uploaded = {};

  void updateCount(String section, int count) {
    setState(() {
      uploaded[section] = count;
    });
  }

  bool isSectionComplete(String section) {
    int req = required[section] ?? 0;
    int count = uploaded[section] ?? 0;

    if (req == 0) return count > 0;
    return count >= req;
  }

  bool isComplete(List<String> sections) {
    for (var section in sections) {
      if (!isSectionComplete(section) && required[section]! > 0) {
        return false;
      }
    }
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final sections = widget.isUpdate
        ? [
            "Before Photos",
            "After Photos",
            "Old Parts",
            "New Parts",
            "Diagnostics",
          ]
        : [
            "Truck Photos",
            "Trailer A Photos",
            "Trailer B Photos",
            "Before Photos",
            "After Photos",
            "Old Parts",
            "New Parts",
            "Diagnostics",
          ];

    return Scaffold(
      appBar: AppBar(
        title: Text("Job ${widget.jobNumber}"),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              itemCount: sections.length,
              itemBuilder: (context, index) {
                String section = sections[index];

                int count = uploaded[section] ?? 0;
                int req = required[section] ?? 0;

                bool isLocked = false;
                if (index > 0) {
                  String prev = sections[index - 1];
                  if (!isSectionComplete(prev)) {
                    isLocked = true;
                  }
                }

                bool complete = isSectionComplete(section);

                return ListTile(
                  title: Text(section),
                  subtitle: req == 0
                      ? Text("Optional | Uploaded: $count")
                      : Text("Min Required: $req | Uploaded: $count"),
                  trailing: isLocked
                      ? const Icon(Icons.lock, color: Colors.grey)
                      : complete
                          ? const Icon(Icons.check_circle, color: Colors.green)
                          : const Icon(Icons.arrow_forward_ios),
                  enabled: !isLocked,
                  onTap: isLocked
                      ? null
                      : () async {
                          final result = await Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => UploadScreen(
                                section: section,
                                jobNumber: widget.jobNumber,
                                images: const [], // ✅ required param
                              ),
                            ),
                          );

                          if (result != null) {
                            updateCount(section, result);
                          }
                        },
                );
              },
            ),
          ),

          if (isComplete(sections))
            Padding(
              padding: const EdgeInsets.all(16),
              child: ElevatedButton(
                onPressed: () {
                  Navigator.popUntil(context, (route) => route.isFirst);
                },
                child: const Text("DONE"),
              ),
            ),
        ],
      ),
    );
  }
}