# Security Specification — ChronoFlow

## 1. Data Invariants
1. **Identity Ownership**: Every document in `/hourly_logs/{logId}` and `/daily_goals/{goalId}` must have a `userId` matching `request.auth.uid`, and `request.auth.token.email_verified == true`.
2. **Immutable Ownership & Creation Time**: `userId` and `createdAt` cannot be modified during updates (`incoming().userId == existing().userId && incoming().createdAt == existing().createdAt`).
3. **Temporal Integrity**: `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
4. **Volumetric & Domain Bounds**:
   - `hour` must be an integer `0 <= hour <= 23`.
   - `screenMinutes` and `productiveScreenMinutes` must be `0 <= val <= 60`, with `productiveScreenMinutes <= screenMinutes`.
   - `activity` string length `1..160`; `title` string length `1..140`.
   - Document IDs (`logId`, `goalId`) must match `^[a-zA-Z0-9_\-]+$` and be `<= 128` chars.
5. **No Blanket Reads**: `get` and `list` operations strictly require `resource.data.userId == request.auth.uid`.

## 2. The "Dirty Dozen" Payloads
1. **Unverified Email Spoof**: `{ userId: "uid1", ... }` with `email_verified: false` -> `PERMISSION_DENIED`.
2. **Cross-User Ownership Spoof**: `userId: "victim_uid"` while authenticated as `"attacker_uid"` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection on Create**: Adding `"isAdmin": true` to `/hourly_logs/{logId}` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection on Update**: Modifying an undeclared key `"hacked": 1` -> `PERMISSION_DENIED`.
5. **Out-of-Range Hour**: `hour: 29` or `hour: -1` -> `PERMISSION_DENIED`.
6. **Screen Time Overflow**: `screenMinutes: 120` or `productiveScreenMinutes: 50` when `screenMinutes: 30` -> `PERMISSION_DENIED`.
7. **Oversized String DoS**: `activity` with 5,000 characters -> `PERMISSION_DENIED`.
8. **Invalid Enum Value**: `cognitiveState: "superhuman"` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: `createdAt` set to past or future timestamp `!= request.time` -> `PERMISSION_DENIED`.
10. **Immutable Field Mutation**: Updating `userId` or `createdAt` on an existing document -> `PERMISSION_DENIED`.
11. **ID Poisoning**: Creating a document with a 500-char ID or special characters `../admin` -> `PERMISSION_DENIED`.
12. **Unauthorized List Scraping**: Listing `/hourly_logs` without `where('userId', '==', request.auth.uid)` -> `PERMISSION_DENIED`.
