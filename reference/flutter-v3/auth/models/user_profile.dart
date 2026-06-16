/// User profile model for THRIVE Radio v3.
///
/// Maps to the `public.users` table — the schema consolidates
/// `first_name`/`last_name` into a single `name` column. Clinical
/// voice-analysis fields (year_of_birth, biological_sex,
/// etc.) exist on the table for v2's profile setup wizard but are intentionally
/// not surfaced here in v1.
library;

class UserProfile {
  UserProfile({
    required this.id,
    required this.clerkUserId,
    required this.email,
    this.name,
    this.phone,
    this.avatarUrl,
    this.imageUrl,
    this.role,
    this.createdAt,
    this.updatedAt,
  });

  /// Create from a `public.users` row JSON.
  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: json['id'] as String,
      clerkUserId: json['clerk_user_id'] as String,
      email: json['email'] as String? ?? '',
      name: json['name'] as String?,
      phone: json['phone'] as String?,
      avatarUrl: json['avatar_url'] as String?,
      imageUrl: json['image_url'] as String?,
      role: json['role'] as String?,
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'] as String)
          : null,
      updatedAt: json['updated_at'] != null
          ? DateTime.parse(json['updated_at'] as String)
          : null,
    );
  }

  /// `public.users.id` — uuid, FK target for user-scoped tables.
  final String id;

  /// Clerk's user identifier (`user_xxx...`). Joins to the Clerk JWT `sub`
  /// claim.
  final String clerkUserId;

  final String email;

  /// Full display name. Single column in v3 (no first/last split).
  final String? name;

  final String? phone;

  /// Clerk-mirrored avatar URL.
  final String? avatarUrl;

  /// Clerk-mirrored profile image URL (typically the same as [avatarUrl] but
  /// kept separate to match the schema column).
  final String? imageUrl;

  /// `user` for normal members, `superadmin`/`admin` for portal staff.
  final String? role;

  final DateTime? createdAt;
  final DateTime? updatedAt;

  /// Convert to JSON suitable for an UPDATE on `public.users`. Only fields we
  /// permit the mobile client to edit are emitted (RLS will reject everything
  /// else anyway).
  Map<String, dynamic> toUpdateJson() {
    return {
      if (name != null) 'name': name,
      if (phone != null) 'phone': phone,
      if (avatarUrl != null) 'avatar_url': avatarUrl,
    };
  }

  UserProfile copyWith({
    String? name,
    String? phone,
    String? avatarUrl,
    String? imageUrl,
  }) {
    return UserProfile(
      id: id,
      clerkUserId: clerkUserId,
      email: email,
      name: name ?? this.name,
      phone: phone ?? this.phone,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      imageUrl: imageUrl ?? this.imageUrl,
      role: role,
      createdAt: createdAt,
      updatedAt: DateTime.now(),
    );
  }

  @override
  String toString() =>
      'UserProfile(id: $id, clerk: $clerkUserId, email: $email, name: $name)';
}
