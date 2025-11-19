## [unreleased]

### 🚀 Features

- *(create-turbo)* Create https://github.com/tknickman/turborepo-empty-starter
- *(create-turbo)* Apply git-ignore transform
- *(create-turbo)* Apply pnpm-eslint transform
- Add shadcn
- Basic live-state implementation
- Add auth and protected routes
- Initial live-state setup
- Add onboarding screen
- Add auth to live-state
- Create org from onboarding
- Add organization switcher
- *(web)* Add sidebar link to threads
- *(api)* Add threads and messages
- *(ui)* Add relative time util
- *(web)* Add thread rendering
- *(ui)* Create input-box block
- *(web)* Send messages
- Add discord integration (#1)
- Add different message styles (#2)
- *(web)* Improve auto scroll
- Add rich text input box (#4)
- Handle formatting for discord (#5)
- Add wailist (#6)
- *(waitlist)* Add posthog
- *(api)* Add priority (#11)
- *(web)* Add priority button (#12)
- *(api)* Add `assignedUser` property to `thread` (#14)
- *(web)* Add assignee button (#15)
- *(api)* Add `status` to `thread` (#17)
- *(web)* Add status button (#18)
- *(web)* New thread list item design (#20)
- *(web)* Add fillters to thread list (#21)
- *(web)* Create settings route and layout (#23)
- *(web)* Add general settings for orgazaniton (#24)
- *(api)* Add `author` abstraction (#25)
- *(web)* Add devtools to create threads (#26)
- *(web)* Add sorting options to thread list (#30)
- *(web)* Use company logo in switcher (#32)
- *(web)* Add breadcrumbs to individual thread page (#38)
- *(web)* Align filter button to the right in threads page (#39)
- *(web)* Organization invitation system (#34)
- *(web)* Add members settings page (#43)
- *(web)* Send invitation emails (#45)
- *(web)* Revamp onboarding flow (#46)
- *(web)* Add user profile settings (#44)
- *(web)* Add integration settings (#51)
- *(web)* Add discord integration settings (#54)
- *(discord)* Use integration settings (#56)
- *(web)* Add landing page (#58)
- *(web)* Add action to submit wailist form (#60)
- *(web/api)* Add google social login (#61)
- *(web)* Add legal pages (#62)
- *(web)* Create public thread list page (#57)
- *(web)* Add empty states (#72)
- *(web)* Add posthog analytics (#73)
- *(api)* Enable RLS (#66)
- *(api)* Add email allowlist (#74)
- *(web)* Create public thread view page (#67)
- *(web)* Add billing page (#76)
- *(web)* Implement URL rewriting (#77)
- *(web)* Client side only navigation and global data caching (#79)
- *(api)* Add email to allowlist when they accept an invite (#81)
- *(web)* Implement live-state deep include (#82)
- *(docs)* Initial fumadocs setup (#85)
- Add docs and support links (#89)
- *(web)* Improve dev-only create thread button
- *(web)* Implement sitemap (#88)
- *(web)* Add API keys using keypal (#93)
- *(api)* Simplify CORS setup and add API proxy route (#95)
- *(api)* Add create thread mutation for easy external api usage (#96)

### 🐛 Bug Fixes

- Bootstrap tanstack start instead of router
- *(web)* Add SubscriptionProvider
- *(discord)* Handle ForumChannel
- *(watlist)* Add missing deps
- *(waitlist)* Add missing deps
- *(waitlist)* Add missing deps
- *(waitlist)* Node-postgres -> postgres.js
- *(waitlist)* Deployment errors
- *(api)* Use `nullable` instead of `optional`
- *(web)* Solve children props lint error in auth.tsx file (#28)
- *(web)* Fix sign-up not redirecting on success (#29)
- *(web)* Messages not using author correctly (#31)
- *(api)* Reorder tables when creating schema to avoid deadlock (#33)
- *(web)* Error loading thread list (#37)
- *(web)* Add temp fix to thread creation until live-state new version release (#40)
- Create thread devtool (#42)
- Solve build errors (#52)
- *(web)* Fix pagination behaviour (#65)
- *(web)* Remove zero on member page (#71)
- Remove before hook on better-auth
- Cast headers to object explicitly
- *(web)* Use import.meta instead of process.env
- Crash when dodo webhook key is missing
- *(api)* Make `author` less restrictive for inserts
- *(api)* Fix integration RLS
- *(web)* Invalidate session cache when loging out (#80)
- *(api)* Threads permissions
- CORS for dev deployment
- Sorting in support page (#83)
- *(api)* Make author public
- *(docs)* Change docs dev environment port number
- Add unique constraint to organization slug (#90)
- *(web)* Fix thread message overflow in private thread page
- *(web)* Integrate Avatar component in organization switcher and update default thread order direction (#92)
- Temp disable deletedAt filter on public support portal
- Use correct env source

### 💼 Other

- Debug auth
- Debug auth
- Debug auth
- Debug auth
- Debug auth
- Debug auth
- Debug auth
- Debug auth
- Add auth debug logs
- Add auth debug logs
- Add auth debug logs

### 🚜 Refactor

- *(web)* Split user and organizationUser loaders (#36)
- *(web)* Control live-state connection (#64)
- Update FIXME comments to TODO
- *(web)* Centralize API URL handling and update auth client usage

### 📚 Documentation

- Update README
- Add LICENSE
- Fix badges on README
- Update README
- Update README
- Update README
- Add initial doc content (#86)

### 🎨 Styling

- *(ui)* Update styles for card
- *(ui)* Update styles for avatar
- *(web)* Fix overflow for thread page
- *(ui)* Update the scrollbar style
- *(web)* Restyle thread list
- *(waitlist)* Fix formatting on mobile
- *(ui)* Fix tooltip animations (#59)

### ⚙️ Miscellaneous Tasks

- Update tailwindcss
- Update tsconfig
- Update to tailwindcss v4
- Setup shadcn-ui
- Remove old package
- Update general project setup
- Clean up
- Add all shadcn components
- *(web)* Remove vinxi
- *(web)* Add proxy for local env
- Update live-state (#3)
- Update lockfile
- Fix package name
- *(waitlist)* Update og
- *(waitlist)* Update og
- *(api)* Add `user` table (#13)
- General fixes (#16)
- *(waitlist)* Add env vars to wrangler
- Pin live-state version (#19)
- *(db)* Update postgresql to v18 and volume path (#27)
- *(web)* Move app to _main pathless route (no-op) (#22)
- Update live-state (#35)
- Update live-state (#41)
- *(web)* Update TS start (#53)
- Add workflow to typecheck and build (#55)
- Update deps and move react to catalog (#63)
- Update live-state (#68)
- Use ogl instead of three.js for shaders (#69)
- *(web)* Update pricing on landing page (#70)
- Prepare for deployment (#75)
- *(api)* Add railway config file
- *(web)* Add wrangler setup
- Update env var names
- Update env
- Fix deploy command
- Change live-state env var name
- Make auth server url public
- Enable logs
- Fix auth server variable
- Setup cross domain cookie
- *(discord)* Setup railway deployment
- *(discord)* Use railpack to build
- *(discord)* Update start command
- Fix dev deployment
- *(api)* Update cookie to use sameSite=None
- *(web)* Improve meta and SEO tags (#78)
- *(api)* Update better auth trusted origins
- Update live-state
- Accept all cors origins
- *(api)* Update cors origin
- Remove waitlist app (#84)
- Move docs to next and setup deployment (#87)
- Update docs deployment details
- Update @live-state/sync version to 0.0.6-canary-3 (#91)
- Update live-state
- Update live-state
- Update live-state
- Add redirectURI option to google provider
- *(web)* Create serverAuthClient to split server auth calls
- Debug api url
- Clean up debug

### ◀️ Revert

- Debug auth
- Debug auth
- Accept all cors origins
- *(web)* Create serverAuthClient to split server auth calls
