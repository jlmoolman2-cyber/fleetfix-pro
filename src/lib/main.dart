import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'screens/job_entry_screen.dart';
import 'package:firebase_storage/firebase_storage.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(); // 🔥 Firebase init added

  runApp(const NVTSApp());
}

class NVTSApp extends StatelessWidget {
  const NVTSApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NVTS App v2.1',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(primarySwatch: Colors.blue),
      home: const JobEntryScreen(),
    );
  }
}