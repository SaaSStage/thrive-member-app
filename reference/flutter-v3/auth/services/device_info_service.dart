/// Device information service for THRIVE Radio
/// 
/// Collects device metadata for analytics tracking.
library;

import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';

class DeviceInfoService {
  DeviceInfoService._();
  
  static final DeviceInfoService _instance = DeviceInfoService._();
  static DeviceInfoService get instance => _instance;

  final DeviceInfoPlugin _deviceInfo = DeviceInfoPlugin();
  PackageInfo? _packageInfo;

  /// Get device information as JSON for analytics
  Future<Map<String, dynamic>> getDeviceInfo() async {
    _packageInfo ??= await PackageInfo.fromPlatform();
    
    final Map<String, dynamic> info = {
      'app_version': _packageInfo?.version ?? 'unknown',
      'build_number': _packageInfo?.buildNumber ?? 'unknown',
    };

    try {
      if (Platform.isAndroid) {
        final androidInfo = await _deviceInfo.androidInfo;
        info['platform'] = 'android';
        info['device_id'] = androidInfo.id;
        info['os_version'] = androidInfo.version.release;
        info['device_model'] = '${androidInfo.manufacturer} ${androidInfo.model}';
        info['sdk_version'] = androidInfo.version.sdkInt.toString();
      } else if (Platform.isIOS) {
        final iosInfo = await _deviceInfo.iosInfo;
        info['platform'] = 'ios';
        info['device_id'] = iosInfo.identifierForVendor;
        info['os_version'] = iosInfo.systemVersion;
        info['device_model'] = iosInfo.utsname.machine;
        info['device_name'] = iosInfo.name;
      } else {
        info['platform'] = Platform.operatingSystem;
        info['os_version'] = Platform.operatingSystemVersion;
      }
    } catch (e) {
      info['platform'] = 'unknown';
      info['error'] = e.toString();
    }

    return info;
  }

  /// Get a simple platform string
  String getPlatform() {
    if (Platform.isAndroid) return 'android';
    if (Platform.isIOS) return 'ios';
    return Platform.operatingSystem;
  }
}
