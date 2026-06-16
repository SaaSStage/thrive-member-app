/// Auth gate widget — gates the app on [ClerkSession.authStateChanges].
///
/// Replaces the prior Supabase Auth-based gate. The session controller emits
/// the current value to new subscribers immediately, so this never sits in a
/// "waiting" state — but we still handle that case defensively for the first
/// frame.
library;

import 'package:flutter/material.dart';

import 'package:radio_online/auth/screens/welcome_screen.dart';
import 'package:radio_online/auth/services/clerk_session.dart';

class AuthGate extends StatelessWidget {
  const AuthGate({required this.child, super.key});

  /// The widget to show when the user is signed in.
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<bool>(
      stream: ClerkSession.instance.authStateChanges,
      initialData: ClerkSession.instance.isAuthenticated,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting &&
            !snapshot.hasData) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        final signedIn = snapshot.data ?? false;
        return signedIn ? child : const WelcomeScreen();
      },
    );
  }
}
