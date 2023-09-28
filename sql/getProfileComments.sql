-- {:profile_id} is a parameter
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
        WHERE parent_id = ''
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
WHERE CAST(SUBSTR(path_index, 1, 1) AS INTEGER) >= 1 -- Start range (offset)
AND CAST(SUBSTR(path_index, 1, 1) AS INTEGER) <= 4 -- End range
ORDER BY path_index