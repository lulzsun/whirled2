-- This sql query gets 4 parent comments with a max of 4 depth (children). 
-- Passing in a parent_id will only return the parent and the children of that parent comment.
-- In the future, look into writing the query that lets us get a number of comments
-- counting both parent and children.
WITH list_orders AS (
    SELECT i1.*, 
    users.username AS username, users.nickname AS nickname,
    (SELECT COUNT(i2.id)
        FROM comments i2
        WHERE i2.parent_id = i1.parent_id
            AND (i2.created > i1.created 
                OR (i2.created = i1.created AND i2.id > i1.id))
    ) list_order
    FROM comments i1
    INNER JOIN users ON i1.user_id = users.id
    WHERE i1.profile_id = {:profile_id}
),
cte AS (
    SELECT * FROM (
        SELECT *, 
            1 depth, 
            (list_order + 1) || '' path_index,
            (
                SELECT COUNT(*) 
                FROM comments subchild
                WHERE subchild.parent_id = li.id
            ) AS count,
            (
                SELECT GROUP_CONCAT(id, ',')
                FROM (
                    SELECT subchild.id
                    FROM comments subchild
                    WHERE subchild.parent_id = li.id
                    ORDER BY created DESC
                    LIMIT 4 -- Limit to 4 subcomments
                )
            ) as _path
        FROM list_orders li
        WHERE CASE
            WHEN {:parent_id} = '' THEN parent_id = ''
            ELSE CASE
                WHEN {:comment_offset} != 0 THEN li.parent_id = {:parent_id} OR li.id = {:parent_id}
                ELSE li.id = {:parent_id}
            END
        END
        ORDER BY created DESC
    )
    UNION ALL
    SELECT li.*, 
        c.depth + 1, 
        c.path_index || '.' || (li.list_order + 1),
        (
            SELECT COUNT(*) 
            FROM comments subchild
            WHERE subchild.parent_id = li.id
        ) AS count,
        (
            SELECT GROUP_CONCAT(id, ',')
            FROM (
                SELECT subchild.id
                FROM comments subchild
                WHERE subchild.parent_id = li.id
                ORDER BY created DESC
                LIMIT 4 -- Limit to 4 subcomments
            )
        ) as _path
    FROM list_orders li INNER JOIN cte c
    ON c.id = li.parent_id 
    WHERE c.depth <= 4 AND c._path LIKE '%' || li.id || '%' -- Limit depth to 4 levels
)
SELECT *
FROM cte
WHERE id = {:parent_id}
OR (CAST(SUBSTR(path_index, 1, 1) AS INTEGER) >= 1 + {:comment_offset} -- Start range (offset)
AND CAST(SUBSTR(path_index, 1, 1) AS INTEGER) <= 4 + {:comment_offset}) -- End range
ORDER BY path_index