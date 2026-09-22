# Linear keeps engineering-state authority

Linear will provide the `issue-tracker` capability, but FrontDesk will not push thread status into Linear. A finished Linear issue may cause an `entity_finished` Agent run, which owns the customer reply and any thread resolution under existing autonomy policy. Resolving or closing a FrontDesk thread never changes the Linear issue.

This deliberately differs from the current GitHub behavior. Support teams close conversations for reasons that do not prove engineering work is complete, so mapping those states back to Linear would corrupt the authoritative engineering workflow. Reopening a Linear issue likewise does not reopen a customer thread that was already settled.

## Status

accepted
