import React from 'react';
import SectionDesc from '../../../site/section/SectionDesc';
const ListPage = () => {
    const tableSections = [
        {
            title: 'Tables',
            items: 6,
            img: 'images/sections/table.png',
            link: '/components/table',
        },
        {
            title: 'Lists',
            items: 11,
            img: 'images/sections/list.png',
            link: '/components/list',
        },
    ];
    return <SectionDesc id="list" withPub items={tableSections} title="List"/>;
};
export default ListPage;
//# sourceMappingURL=index.jsx.map