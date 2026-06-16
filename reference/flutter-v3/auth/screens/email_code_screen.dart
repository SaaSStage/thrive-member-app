/// Email-code device verification screen.
///
/// Shown when [AuthService.signIn] returns `requiresEmailConfirmation: true`
/// (Clerk's "trust this device" interstitial on first sign-in from a new
/// install — NOT MFA). Collects the 6-digit code Clerk emailed to the user
/// and completes the sign-in via [AuthService.completeEmailCodeVerification].
/// On success, the AuthGate's authStateChanges stream emits authenticated=true
/// and the app routes to the main UI automatically.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:radio_online/auth/services/auth_service.dart';
import 'package:radio_online/auth/widgets/auth_button.dart';
import 'package:radio_online/auth/widgets/auth_text_field.dart';

class EmailCodeScreen extends StatefulWidget {
  const EmailCodeScreen({
    required this.signInAttemptId,
    required this.email,
    super.key,
  });

  /// The `sia_...` id Clerk returned in the sign-in attempt; needed to
  /// resume the flow.
  final String signInAttemptId;

  /// Address the code was sent to — shown for user confirmation.
  final String email;

  @override
  State<EmailCodeScreen> createState() => _EmailCodeScreenState();
}

class _EmailCodeScreenState extends State<EmailCodeScreen> {
  final _formKey = GlobalKey<FormState>();
  final _codeController = TextEditingController();

  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _handleVerify() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final result = await AuthService.instance.completeEmailCodeVerification(
      signInAttemptId: widget.signInAttemptId,
      code: _codeController.text.trim(),
    );

    if (!mounted) return;

    setState(() {
      _isLoading = false;
    });

    if (result.success) {
      // ClerkSession is now authenticated; AuthGate will route to the main
      // app. Pop the stack so we don't leave verification screens behind.
      Navigator.of(context).popUntil((route) => route.isFirst);
    } else {
      setState(() {
        _errorMessage = result.errorMessage;
        _codeController.clear();
      });
    }
  }

  String? _validateCode(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Enter the 6-digit code';
    }
    if (value.trim().length != 6) {
      return 'Code must be 6 digits';
    }
    if (!RegExp(r'^\d{6}$').hasMatch(value.trim())) {
      return 'Code must be 6 digits';
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
          onPressed: _isLoading ? null : () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 20),

                Text(
                  'Verify your device',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),

                const SizedBox(height: 8),

                Text.rich(
                  TextSpan(
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: Theme.of(context)
                              .textTheme
                              .bodyLarge
                              ?.color
                              ?.withValues(alpha: 0.7),
                        ),
                    children: [
                      const TextSpan(text: "We sent a 6-digit code to "),
                      TextSpan(
                        text: widget.email,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const TextSpan(
                        text:
                            '. Enter it below to finish signing in. This is a '
                            'one-time check the first time you sign in on this '
                            'device.',
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 32),

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

                AuthTextField(
                  controller: _codeController,
                  label: 'Code',
                  hint: '6-digit code',
                  prefixIcon: Icons.lock_outlined,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.done,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(6),
                  ],
                  autofillHints: const [AutofillHints.oneTimeCode],
                  validator: _validateCode,
                  onSubmitted: (_) => _handleVerify(),
                  enabled: !_isLoading,
                ),

                const SizedBox(height: 24),

                AuthButton(
                  onPressed: _handleVerify,
                  label: 'Verify',
                  isLoading: _isLoading,
                ),

                const SizedBox(height: 16),

                Center(
                  child: TextButton(
                    onPressed: _isLoading
                        ? null
                        : () {
                            // Go back to sign-in to re-request a code.
                            // Clerk will issue a fresh attempt id and email.
                            Navigator.of(context).pop();
                          },
                    child: Text(
                      "Didn't receive a code? Try signing in again",
                      style: TextStyle(
                        color: Theme.of(context).primaryColor,
                        fontWeight: FontWeight.w600,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),

                const SizedBox(height: 32),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
