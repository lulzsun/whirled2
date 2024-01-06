# Testing sql queries using bash script
Use the following examples to quickly iterate changes to queries

## getProfileComments.sql
```bash
./sql/test.sh ./sql/profile/getProfileComments.sql \
    profile_id="'dh1p364wjjm4122'" \
    parent_id="''" \
    comment_offset="0"
```