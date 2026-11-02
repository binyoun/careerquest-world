// Mission content. Each room maps to one PACE capability.
// Choices have no right answer: each one shows what tends to happen and
// what it says about how you work, then the student writes a PACE trace.

export const MISSIONS = {
  client: {
    id: "client",
    room: "Client Room",
    cap: "Connected",
    color: "#DA291C",
    title: "The client call",
    setup:
      "Week three of your first job. Your account manager is on leave and the client calls you directly. " +
      "They say the concept you presented \"doesn't feel premium\" and they need a new direction by Friday.",
    steps: [
      {
        prompt: "The client is still on the line. What do you do first?",
        choices: [
          {
            label: "Agree to a new direction by Friday so they stay happy.",
            outcome:
              "The call ends well. On Thursday your team learns you promised a full rework without checking capacity, " +
              "and the senior designer has to cancel other work to cover it.",
            shows: "You protect the relationship in the moment. The cost lands on people who were not on the call."
          },
          {
            label: "Ask what \"premium\" means to them, with an example they like.",
            outcome:
              "The client sends two reference brands. It turns out they mean the type and paper stock, not the concept. " +
              "The change is a day of work, not a week.",
            shows: "You treat vague feedback as a question to open, not an order to follow."
          },
          {
            label: "Say you will check with your team and call back in an hour.",
            outcome:
              "The client is slightly impatient but agrees. Your senior helps you frame the call-back, " +
              "and you go in with a clear scope.",
            shows: "You know where your authority ends and you bring others in before committing them."
          }
        ]
      },
      {
        prompt: "Back at the studio, the senior designer thinks the client is wrong. How do you handle the gap?",
        choices: [
          {
            label: "Pass the senior's view to the client as it is.",
            outcome: "The client hears it as the studio not listening. The next email is cc'd to the account director.",
            shows: "You are honest, but you are carrying a message instead of translating it."
          },
          {
            label: "Build one option each way and let the client compare.",
            outcome: "More work, but the client picks a mix and feels heard. Your senior notices you held both views.",
            shows: "You make disagreement visible and workable instead of choosing a side."
          },
          {
            label: "Quietly do what the client wants and say nothing to the senior.",
            outcome: "The client is happy. Your senior finds out at the review and stops including you in client threads.",
            shows: "You avoid the conflict, and lose the trust that would let you handle the next one."
          }
        ]
      }
    ],
    reflect: {
      cap: "You were between a client, a senior and a deadline. Where were you inside that group: leading, holding back, translating between people?",
      identity: "Is the way you worked here the way you want to work with people in your career? What would you keep, and what would you change?"
    }
  },

  studio: {
    id: "studio",
    room: "Studio",
    cap: "Adaptive",
    color: "#1E7A73",
    title: "The brief moved",
    setup:
      "Two days before launch, the brief changes. The campaign you designed for print now has to run as " +
      "six short social videos. Nobody on the team has made motion work for this client before.",
    steps: [
      {
        prompt: "The team meets in ten minutes. What do you walk in with?",
        choices: [
          {
            label: "A case for keeping print and pushing video to phase two.",
            outcome: "The producer appreciates the honesty, but the client has already bought the media slots. Video is happening.",
            shows: "You protect the original plan. Useful when the change is optional, costly when it is not."
          },
          {
            label: "A rough storyboard that reuses the print layouts as motion frames.",
            outcome: "It gives the room something concrete to react to. The team adopts it as the starting point.",
            shows: "You let your work move with the change instead of starting from zero."
          },
          {
            label: "A list of what you don't know how to do yet.",
            outcome: "Two colleagues admit they don't know either. The producer books a motion freelancer for a day.",
            shows: "You name the gap early, which lets others plan around it."
          }
        ]
      },
      {
        prompt: "Day two. The first video looks rough and time is short. What gives?",
        choices: [
          {
            label: "Work through the night to get all six polished.",
            outcome: "All six ship. You are exhausted at the launch meeting and miss a client comment that matters.",
            shows: "You adapt by absorbing the cost yourself. It works once."
          },
          {
            label: "Ship three strong videos and propose the rest next week.",
            outcome: "The client accepts. The three perform well and buy goodwill for the remaining work.",
            shows: "You change the shape of the deliverable, not just the effort."
          },
          {
            label: "Ask the client which two matter most and go deep on those.",
            outcome: "The client is surprised to be asked, then gives a clear answer. The team stops guessing.",
            shows: "You turn a constraint into a decision the client owns with you."
          }
        ]
      }
    ],
    reflect: {
      cap: "When the plan changed, did you protect your original idea or let it move? What did you hold on to, and why?",
      identity: "Would the practitioner you want to become have made the same moves? What does this say about you under pressure?"
    }
  },

  crit: {
    id: "crit",
    room: "Crit Room",
    cap: "Critically Engaged",
    color: "#C68A1E",
    title: "The shortcut",
    setup:
      "A senior colleague shares an AI-generated hero image for a client pitch. It looks very close to the style " +
      "of a well-known local photographer. The pitch is tomorrow and everyone in the room loves it.",
    steps: [
      {
        prompt: "The room is waiting for reactions. What do you say?",
        choices: [
          {
            label: "Nothing. You are new, and it is not your call.",
            outcome: "The pitch goes ahead. A week later the photographer's followers spot the likeness online.",
            shows: "You read the room correctly and still carry the doubt. Silence was a decision too."
          },
          {
            label: "\"It's strong. Do we know whose style it's drawing on?\"",
            outcome: "A pause, then the senior laughs and says it does look like that photographer. The room starts discussing it.",
            shows: "You raise the question as a question, which makes it safe for others to answer."
          },
          {
            label: "Say clearly that it is unethical to use.",
            outcome: "The senior gets defensive. The point is right, but the meeting turns into a defence of the image.",
            shows: "You act from conviction. How you say it decides whether people can move with you."
          }
        ]
      },
      {
        prompt: "The team agrees it needs a fix, with less than a day left. What do you propose?",
        choices: [
          {
            label: "Contact the photographer and ask about licensing or a quick shoot.",
            outcome: "They are flattered and busy, but offer an existing image at a fair rate. The pitch gets a real credit.",
            shows: "You go to the source. It costs more and builds a relationship the studio can use again."
          },
          {
            label: "Redo the image with a deliberately different visual language.",
            outcome: "Less polished, but clearly yours. The client asks about the process and you have a good answer.",
            shows: "You treat the problem as a design question, not only a legal one."
          },
          {
            label: "Keep the image and add a note that it is AI-generated.",
            outcome: "The disclosure is honest, but it does not answer whose work the style came from.",
            shows: "You solve for transparency. Worth asking whether that was the real issue."
          }
        ]
      }
    ],
    reflect: {
      cap: "You took a position in that room. Was it from conviction, or from not wanting to lose face? Both are worth knowing.",
      identity: "What kind of maker do your choices here describe? Is that the maker you want an employer to meet?"
    }
  }
};

export const CAPS = ["Connected", "Adaptive", "Critically Engaged"];
export const CAP_COLOR = { Connected: "#DA291C", Adaptive: "#1E7A73", "Critically Engaged": "#C68A1E" };
export const DEEP_TARGET = 2;
