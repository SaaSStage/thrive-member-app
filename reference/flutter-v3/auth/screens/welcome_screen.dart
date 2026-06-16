/// Welcome screen - Entry point for unauthenticated users
library;

import 'package:flutter/material.dart';
import 'package:radio_online/auth/screens/login_screen.dart';
import 'package:radio_online/auth/widgets/auth_button.dart';
import 'package:radio_online/utility/app_info.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final primaryColor = Theme.of(context).primaryColor;

    return Scaffold(
      body: Container(
        width: size.width,
        height: size.height,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              primaryColor,
              primaryColor.withValues(alpha: 0.8),
              Theme.of(context).scaffoldBackgroundColor,
            ],
            stops: const [0.0, 0.4, 1.0],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              children: [
                const Spacer(flex: 2),
                
                // Logo
                Container(
                  width: 140,
                  height: 140,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(28),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.2),
                        blurRadius: 20,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(28),
                    child: Image.asset(
                      'assets/images/logo.png',
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stack) {
                        return Icon(
                          Icons.radio,
                          size: 80,
                          color: primaryColor,
                        );
                      },
                    ),
                  ),
                ),
                
                const SizedBox(height: 32),
                
                // App name
                Text(
                  AppInfo().appName,
                  style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                    letterSpacing: 1.2,
                  ),
                ),
                
                const SizedBox(height: 12),
                
                // Tagline
                Text(
                  'Your Healing Station.',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Colors.white.withValues(alpha: 0.9),
                    fontWeight: FontWeight.w400,
                  ),
                ),
                
                const Spacer(flex: 3),
                
                // TODO: Restore "Get Started" registration flow when ready
                // AuthButton(
                //   onPressed: () {
                //     Navigator.of(context).push(
                //       MaterialPageRoute<void>(
                //         builder: (_) => const RegisterScreen(),
                //       ),
                //     );
                //   },
                //   label: 'Get Started',
                // ),

                // Sign In button (replaces "Get Started" for now)
                AuthButton(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const LoginScreen(),
                      ),
                    );
                  },
                  label: 'Sign In',
                ),
                
                const SizedBox(height: 16),
                
                // TODO: Restore "Already have an account? Sign In" link when registration is re-enabled
                // AuthTextButton(
                //   onPressed: () {
                //     Navigator.of(context).push(
                //       MaterialPageRoute<void>(
                //         builder: (_) => const LoginScreen(),
                //       ),
                //     );
                //   },
                //   text: 'Already have an account?',
                //   linkText: 'Sign In',
                // ),
                
                const SizedBox(height: 32),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
