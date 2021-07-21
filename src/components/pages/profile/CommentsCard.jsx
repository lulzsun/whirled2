import React from 'react';
import CommentEditor from 'src/components/common/CommentEditor';
import CommentSection from 'src/components/common/CommentSection';

export default function CommentsCard (props) {

  return (
    <div className="max-w-5xl w-full mx-auto z-10">
      <div className="flex flex-col">
        <div className="bg-gray-900 border border-white-900 shadow-lg rounded-3xl p-4 m-4">
          <div className="relative flex-none sm:flex">
            {/* Heading */}
            <div className="absolute flex flex-row w-full transform -translate-y-full">
              <div className="flex-1 inline-flex items-center">
                <div className="p-2 pl-4 pr-4 text-white leading-none bg-green-500 rounded-full">
                  Comments
                </div>
              </div>
            </div>
            {/* Content */}
            <div className="w-full mb-2">
              <form>
                {/* Leave a comment section */}
                <CommentEditor parentId={props.profileData._id} parentType={'Profile'}/>
                {/* Other's comments */}
                <CommentSection commentArray={props.profileData.comments}/>
              </form>
            </div>
            {/*  Footer */}
            <div className="absolute flex flex-row w-full top-full">
              <div className="flex-1 inline-flex justify-center">
                <div className="p-1 pl-2 pr-2 m-1.5 text-xs text-white leading-none bg-green-500 hover:bg-green-600 cursor-pointer rounded-full">
                  Show more comments
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}