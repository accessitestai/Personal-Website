# Firestore security rules for the feedback form

The `feedback.html` page writes to a `feedback` collection in Firestore
using Firebase anonymous auth so users do not have to create an account
to send a message.

For this to work safely, the Firestore rules need to:

1. Allow **anonymous-authenticated users** to *write* into the `feedback`
   collection.
2. **Reject all reads** from clients (only the developer can see
   submissions, via the Firebase Console).
3. **Validate the shape** of each submission so a bad-faith actor cannot
   write arbitrary documents.

Paste the snippet below into the **Firestore Rules** tab of the Firebase
Console for the `akhilesh-malani-website` project, click **Publish**,
and the form will start accepting submissions immediately.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    /* Existing rules for other collections stay above this block.
       Add the feedback rule alongside them, do not replace the whole
       file. */

    match /feedback/{docId} {
      // Anyone (including anonymous-auth users) can create a feedback
      // doc, but only if the payload looks like a real form submission.
      allow create: if request.auth != null
        && request.resource.data.keys().hasOnly([
             'kind', 'name', 'email', 'url', 'message',
             'at', 'ua', 'anonUid', 'createdAt', 'source'
           ])
        && request.resource.data.kind in ['bug', 'feature', 'accessibility', 'other']
        && request.resource.data.message is string
        && request.resource.data.message.size() >= 10
        && request.resource.data.message.size() <= 5000
        && (request.resource.data.name == null  || request.resource.data.name.size()  <= 120)
        && (request.resource.data.email == null || request.resource.data.email.size() <= 200)
        && (request.resource.data.url == null   || request.resource.data.url.size()   <= 500)
        && request.resource.data.at is list
        && request.resource.data.at.size() <= 10;

      // Nobody can read feedback from the client. The developer reads
      // submissions in the Firebase Console.
      allow read, update, delete: if false;
    }

  }
}
```

## How to read submissions

1. Open https://console.firebase.google.com/project/akhilesh-malani-website/firestore.
2. Open the `feedback` collection.
3. Each submission is a document; the most recent ones are at the top.

For a busy week you might also export the collection to BigQuery or
just download the documents as JSON from the console. There is no need
for a custom admin UI in v1.

## How to turn off the form temporarily

If you ever need to stop accepting feedback (for example after a viral
post when the volume becomes unmanageable), change the rule above to:

```
allow create: if false;
```

Click Publish. The form will then surface the "permission-denied"
error message to users, which already points them at email as a
fallback. Re-enable by reverting the rule.

## Anonymous auth setup

In the Firebase Console, go to **Authentication > Sign-in method** and
ensure **Anonymous** is enabled. Without that, `signInAnonymously()`
fails and the form falls back to its error message.
