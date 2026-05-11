# Security Specification - Ação Solidária

## 1. Data Invariants
- **Registrations**: 
    - Must have a valid `paymentId`.
    - `status` can only be `pending`, `approved`, or `cancelled`.
    - `amount` must be a positive number.
    - `cpf` must be a valid string format (digits).
    - `createdAt` is immutable after creation.
- **Access Control**:
    - Public can create registrations.
    - Public can read a single registration by ID (for payment status).
    - Only Admins can list all registrations.
    - Only Admins can create/read payment logs.

## 2. The "Dirty Dozen" Payloads (Attacks)
1. **Status Spoofing**: Attempt to create a registration with `status: 'approved'`.
2. **Amount Manipulation**: Attempt to create a registration with `amount: -100`.
3. **Admin Escalation**: Attempt to create a document in `/admins/` as an unauthenticated user.
4. **Log Tampering**: Attempt to delete a log in `payment_logs`.
5. **Bulk Scraping**: Attempt to list `/registrations` without admin auth.
6. **Identity Injection**: Attempt to update another user's registration `status`.
7. **Timestamp Fraud**: Attempt to set a `createdAt` date in the future.
8. **Shadow Field Injection**: Attempt to create a registration with an undocumented field `isSpecial: true`.
9. **Large Payload**: Attempt to send a 1MB string in the `name` field.
10. **ID Poisoning**: Attempt to create a registration with an ID containing malicious characters.
11. **Email Spoofing**: Attempt to read admin data using a non-verified email.
12. **PII Leak**: Attempt to list users and their CPF without admin roles.

## 3. Test Runner Scaffolding (Simplified for Rules)
The `firestore.rules` will be tested against these cases.

```javascript
// Example Test Concept
test('public can create pending registration', () => {
  assertSucceeds(client.collection('registrations').add({
    name: 'Test',
    email: 'test@test.com',
    status: 'pending',
    amount: 50,
    // ...other valid fields
  }));
});

test('public cannot create approved registration', () => {
  assertFails(client.collection('registrations').add({
    name: 'Test',
    status: 'approved',
    // ...
  }));
});
```
