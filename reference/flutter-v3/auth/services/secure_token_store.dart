import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'clerk_client.dart';

/// flutter_secure_storage-backed [ClerkTokenStore]. iOS uses the keychain;
/// Android uses EncryptedSharedPreferences via the AndroidX Security crypto
/// library. The token persists across app launches but is wiped on uninstall.
class SecureClerkTokenStore implements ClerkTokenStore {
  SecureClerkTokenStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'clerk_dev_session_token';

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() => _storage.read(key: _key);

  @override
  Future<void> write(String token) =>
      _storage.write(key: _key, value: token);

  @override
  Future<void> clear() => _storage.delete(key: _key);
}
