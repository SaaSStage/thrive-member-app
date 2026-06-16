/// Login screen for existing users
library;

import 'package:flutter/material.dart';
import 'package:radio_online/auth/screens/email_code_screen.dart';
import 'package:radio_online/auth/services/auth_service.dart';
import 'package:radio_online/auth/widgets/auth_button.dart';
import 'package:radio_online/auth/widgets/auth_text_field.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final result = await AuthService.instance.signIn(
      email: _emailController.text.trim(),
      password: _passwordController.text,
    );

    if (!mounted) return;

    setState(() {
      _isLoading = false;
    });

    if (result.success) {
      // First sign-in on this device → Clerk wants an email-code device
      // verification. Push the email-code screen and let it finish the flow.
      if (result.requiresEmailConfirmation &&
          result.signInAttemptId != null) {
        await Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => EmailCodeScreen(
              signInAttemptId: result.signInAttemptId!,
              email: result.signInEmail ?? _emailController.text.trim(),
            ),
          ),
        );
        return;
      }
      // Already signed in (device was trusted from a prior session, or no
      // verification step). AuthGate will route to the main app.
      if (!mounted) return;
      Navigator.of(context).popUntil((route) => route.isFirst);
    } else {
      setState(() {
        _errorMessage = result.errorMessage;
      });
    }
  }

  String? _validateEmail(String? value) {
    if (value == null || value.isEmpty) {
      return 'Please enter your email';
    }
    if (!RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$').hasMatch(value)) {
      return 'Please enter a valid email';
    }
    return null;
  }

  String? _validatePassword(String? value) {
    if (value == null || value.isEmpty) {
      return 'Please enter your password';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Form(
            key: _formKey,
            child: AutofillGroup(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 20),
                  
                  // Header
                  Text(
                    'Welcome Back',
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  
                  const SizedBox(height: 8),
                  
                  Text(
                    'Sign in to continue',
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: Theme.of(context).textTheme.bodyLarge?.color?.withValues(alpha: 0.7),
                    ),
                  ),
                  
                  const SizedBox(height: 40),
                  
                  // Error message
                  if (_errorMessage != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.errorContainer,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.error_outline,
                            color: Theme.of(context).colorScheme.error,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              _errorMessage!,
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.error,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],
                  
                  // Email field
                  AuthTextField(
                    controller: _emailController,
                    label: 'Email',
                    hint: 'Enter your email',
                    prefixIcon: Icons.email_outlined,
                    keyboardType: TextInputType.emailAddress,
                    validator: _validateEmail,
                    autofillHints: const [AutofillHints.email],
                    enabled: !_isLoading,
                  ),
                  
                  const SizedBox(height: 16),
                  
                  // Password field
                  AuthTextField(
                    controller: _passwordController,
                    label: 'Password',
                    hint: 'Enter your password',
                    prefixIcon: Icons.lock_outlined,
                    obscureText: true,
                    validator: _validatePassword,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.password],
                    onSubmitted: (_) => _handleLogin(),
                    enabled: !_isLoading,
                  ),
                  
                  const SizedBox(height: 12),
                  
                  // TODO: Restore forgot password link when needed
                  // Align(
                  //   alignment: Alignment.centerRight,
                  //   child: TextButton(
                  //     onPressed: _isLoading
                  //         ? null
                  //         : () {
                  //             Navigator.of(context).push(
                  //               MaterialPageRoute<void>(
                  //                 builder: (_) => const ForgotPasswordScreen(),
                  //               ),
                  //             );
                  //           },
                  //     child: Text(
                  //       'Forgot Password?',
                  //       style: TextStyle(
                  //         color: Theme.of(context).primaryColor,
                  //         fontWeight: FontWeight.w600,
                  //       ),
                  //     ),
                  //   ),
                  // ),
                  
                  const SizedBox(height: 24),
                  
                  // Sign in button
                  AuthButton(
                    onPressed: _handleLogin,
                    label: 'Sign In',
                    isLoading: _isLoading,
                  ),
                  
                  const SizedBox(height: 24),
                  
                  // TODO: Restore registration link when registration is re-enabled
                  // Center(
                  //   child: AuthTextButton(
                  //     onPressed: _isLoading
                  //         ? () {}
                  //         : () {
                  //             Navigator.of(context).pushReplacement(
                  //               MaterialPageRoute<void>(
                  //                 builder: (_) => const RegisterScreen(),
                  //               ),
                  //             );
                  //           },
                  //     text: "Don't have an account?",
                  //     linkText: 'Create one',
                  //   ),
                  // ),
                  
                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
