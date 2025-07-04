import React, { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { generateAccessCode, generateUrlSlug, generateDashboardToken } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Image, Loader2, X } from "lucide-react";
import MultipleChoiceEditor from "./MultipleChoiceEditorNew";
import QuestionList from "./QuestionList";
import AdPlaceholder from "../common/AdPlaceholder";
// Remove Layout import to prevent duplicate headers/footers
import { Question } from "@shared/schema";
import { validateQuiz } from "@/lib/quizUtils";

const QuizCreation: React.FC = () => {
  // Component-level unique key for tracking
  const componentKey = React.useId();
  
  // Creator name from homepage (stored in sessionStorage)
  const [creatorName, setCreatorName] = useState("");
  
  // UI navigation and toast
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  // Get the username directly from session storage once and preserve it
  React.useEffect(() => {
    // Check both possible keys from session storage
    const username = sessionStorage.getItem("username") || sessionStorage.getItem("userName");
    
    // Handle missing username case
    if (!username) {
      toast({
        title: "Important",
        description: "Please go back to the homepage and enter your name first",
        variant: "destructive"
      });
      return;
    }

    console.log("Retrieved username from session:", username);
    
    // Clear ALL quiz-related data from storage while preserving user identity
    const userId = sessionStorage.getItem("userId");
    sessionStorage.clear();
    localStorage.clear();
    
    // Restore critical user data
    if (userId) sessionStorage.setItem("userId", userId);
    sessionStorage.setItem("username", username);
    sessionStorage.setItem("userName", username); // For compatibility
    
    // Set the creator name state
    setCreatorName(username);
  }, [toast]);
  
  // Question state
  const [questionText, setQuestionText] = useState("");
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correctOption, setCorrectOption] = useState<number>(0);
  
  // Image handling for questions
  const [questionImage, setQuestionImage] = useState<File | null>(null);
  const [questionImagePreview, setQuestionImagePreview] = useState<string | null>(null);
  const [editingImageUrl, setEditingImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Collection of questions for this quiz - initialize from localStorage if available
  const [questions, setQuestions] = useState<Question[]>(() => {
    // Start with empty array for new quiz sessions
    return [];
  });

  // Save questions to sessionStorage (not localStorage) when they change
  useEffect(() => {
    try {
      if (questions.length > 0) {
        sessionStorage.setItem('current_quiz_draft_questions', JSON.stringify(questions));
      } else {
        sessionStorage.removeItem('current_quiz_draft_questions');
      }
    } catch (e) {
      console.error("Error managing quiz questions:", e);
    }
  }, [questions]);
  // Clear storage on mount to ensure fresh state while preserving user identity
  useEffect(() => {
    // Get current user data
    const username = sessionStorage.getItem("username") || sessionStorage.getItem("userName");
    const userId = sessionStorage.getItem("userId");

    if (!username || !userId) {
      console.warn("Missing user identity data");
      return;
    }

    // Clear all storage but preserve user identity
    sessionStorage.clear();
    localStorage.clear();

    // Restore user identity
    sessionStorage.setItem("userId", userId);
    sessionStorage.setItem("username", username);
    sessionStorage.setItem("userName", username); // For compatibility
    
    // Clear question-specific data
    setQuestions([]);
    
    return () => {
      sessionStorage.removeItem('current_quiz_draft_questions');
    };
  }, []);
  
  // Ad refresh counter - increments whenever we want to refresh ads
  const [adRefreshCounter, setAdRefreshCounter] = useState(0);
  
  // Minimum required questions indicator
  const requiredQuestionsCount = 5;
  const questionsNeeded = Math.max(0, requiredQuestionsCount - questions.length);
  
  // Image upload mutation
  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      
      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData
      });
      
      if (!response.ok) {
        throw new Error("Failed to upload image");
      }
      
      return response.json();
    }
  });
  // Create quiz mutation
  const createQuizMutation = useMutation({
    mutationFn: async () => {
      // Get user identity from session storage
      const currentUserId = parseInt(sessionStorage.getItem("userId") || "0");
      const username = sessionStorage.getItem("username") || sessionStorage.getItem("userName");
      
      // Validate user identity
      if (!username || !currentUserId) {
        console.error("Missing user identity:", { username, currentUserId });
        throw new Error("Missing creator information. Please return to homepage.");
      }
      
      // Use the username directly from storage to ensure consistency
      const effectiveCreatorName = username;

      // Validate quiz has enough questions
      if (questions.length < requiredQuestionsCount) {
        throw new Error(`Quiz needs at least ${requiredQuestionsCount} questions.`);
      }

      // Generate fresh tokens
      const accessCode = generateAccessCode();
      const dashboardToken = generateDashboardToken();      const urlSlug = generateUrlSlug(effectiveCreatorName);

      // Create the quiz
      const quizResponse = await apiRequest("POST", "/api/quizzes", {
        creatorId: currentUserId,
        creatorName: effectiveCreatorName,
        accessCode, 
        urlSlug,
        dashboardToken
      });

      if (!quizResponse.ok) {
        throw new Error("Failed to create quiz");
      }

      const quiz = await quizResponse.json();
      
      // Create all questions for the quiz
      const questionPromises = questions.map((question, index) =>
        apiRequest("POST", "/api/questions", {
          ...question,
          quizId: quiz.id,
          order: index
        })
      );
      
      await Promise.all(questionPromises);
      return quiz;
    }
  });

  // Handle adding a new question
  const handleAddQuestion = async () => {
    // Validate question has text
    if (!questionText.trim()) {
      toast({
        title: "Question Required",
        description: "Please enter a question",
        variant: "destructive"
      });
      return;
    }
    
    // Validate all options are filled
    if (options.some(opt => !opt.trim())) {
      toast({
        title: "Options Required",
        description: "Please fill in all options",
        variant: "destructive"
      });
      return;
    }

    try {
      // Handle image upload if present
      let imageUrl = null;
      
      // Use the existing image URL if we're editing a question
      if (editingImageUrl) {
        console.log("Using existing image URL from edit:", editingImageUrl);
        imageUrl = editingImageUrl;
      }
      // Otherwise, upload the new image if one is selected
      else if (questionImage) {
        try {
          const uploadResult = await uploadImageMutation.mutateAsync(questionImage);
          imageUrl = uploadResult.imageUrl;
        } catch (error) {
          console.error("Failed to upload image:", error);
          toast({
            title: "Image Upload Failed",
            description: "Your question will be added without the image",
            variant: "destructive"
          });
        }
      }

      // Prepare the correct answers array
      const correctAnswers = [options[correctOption]];

      // Create the question object
      const newQuestion: Question = {
        id: Date.now(), // Temporary ID until saved to server
        quizId: 0, // Will be set when quiz is created
        text: questionText,
        type: "multiple-choice",
        options,
        correctAnswers,
        hint: null,
        order: questions.length,
        imageUrl
      };

      // Add to questions collection
      setQuestions(prev => [...prev, newQuestion]);
      
      // Increment ad refresh counter to reload ads
      setAdRefreshCounter(prev => prev + 1);
      
      // Reset form for next question
      resetForm();
      
      toast({
        title: "Question Added",
        description: `${questions.length + 1} of ${requiredQuestionsCount} questions added`,
        variant: "default"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add question",
        variant: "destructive"
      });
    }
  };

  // Handle image selection
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: "File Too Large",
          description: "Image must be less than 10MB",
          variant: "destructive"
        });
        return;
      }
      
      setQuestionImage(file);
      const imageUrl = URL.createObjectURL(file);
      setQuestionImagePreview(imageUrl);
    }
  };
  
  // Handle removing an image
  const handleRemoveImage = () => {
    setQuestionImage(null);
    if (questionImagePreview) {
      URL.revokeObjectURL(questionImagePreview);
      setQuestionImagePreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Reset form fields
  const resetForm = () => {
    setQuestionText("");
    setOptions(["", "", "", ""]);
    setCorrectOption(0);
    setEditingImageUrl(null); // Clear the editing image URL
    handleRemoveImage();
  };


  
  // Edit existing question
  const handleEditQuestion = (index: number) => {
    const question = questions[index];
    
    // Set the question text
    setQuestionText(question.text);
    
    // Set the options and correct answer
    if (question.options) {
      setOptions(question.options as string[]);
      const correctAnswerIndex = (question.options as string[]).findIndex(
        opt => (question.correctAnswers as string[]).includes(opt)
      );
      setCorrectOption(correctAnswerIndex >= 0 ? correctAnswerIndex : 0);
    }
    
    // Handle the image
    if (question.imageUrl) {
      setQuestionImagePreview(question.imageUrl);
      // Save the image URL separately so we can use it when adding the question
      setEditingImageUrl(question.imageUrl);
      console.log("Editing question with image URL:", question.imageUrl);
    } else {
      handleRemoveImage();
      setEditingImageUrl(null);
    }
    
    // Remove the question from the list
    const updatedQuestions = [...questions];
    updatedQuestions.splice(index, 1);
    setQuestions(updatedQuestions);
  };

  // Delete a question
  const handleDeleteQuestion = (index: number) => {
    const updatedQuestions = [...questions];
    updatedQuestions.splice(index, 1);
    setQuestions(updatedQuestions);
  };

  // Clear storage and validate quiz creation state
  const handleFinishQuiz = async () => {
    try {
      // First validate creator name exists
      const creatorName = sessionStorage.getItem("username") || sessionStorage.getItem("userName");
      if (!creatorName) {
        toast({
          title: "Missing Creator Name",
          description: "Please go back to the homepage and enter your name first",
          variant: "destructive"
        });
        return;
      }

      // Validate questions
      if (questions.length < requiredQuestionsCount) {
        toast({
          title: "More Questions Needed",
          description: `Please add ${questionsNeeded} more question(s)`,
          variant: "destructive"
        });
        return;
      }      // Clear ALL quiz-related data while preserving user identity
      const userId = sessionStorage.getItem("userId");
      const username = sessionStorage.getItem("username") || sessionStorage.getItem("userName");
      
      // Clear everything
      sessionStorage.clear();
      localStorage.clear();
      
      // Restore only essential user identity data
      if (userId) sessionStorage.setItem("userId", userId);
      if (username) {
        sessionStorage.setItem("username", username);
        sessionStorage.setItem("userName", username); // For compatibility
      }

      // Generate fresh tokens
      const accessCode = generateAccessCode();
      const dashboardToken = generateDashboardToken();
      const urlSlug = generateUrlSlug(creatorName);

      // Log creation attempt
      console.log("Creating quiz with fresh data:", {
        creatorName,
        accessCode,
        urlSlug 
      });

      // Create the quiz
      const quiz = await createQuizMutation.mutateAsync();
        
      // Clear any remaining question data
      sessionStorage.removeItem('current_quiz_draft_questions');
      localStorage.removeItem('qzonme_draft_questions');
      setQuestions([]); // Reset questions state
        
      toast({
        title: "Quiz Created!",
        description: "Your quiz has been created successfully",
        variant: "default"
      });
        
      // Store fresh tokens for share page
      sessionStorage.setItem("currentQuizId", quiz.id.toString());
      sessionStorage.setItem("currentQuizAccessCode", quiz.accessCode);
      sessionStorage.setItem("currentQuizUrlSlug", quiz.urlSlug);
      sessionStorage.setItem("currentQuizDashboardToken", quiz.dashboardToken);
        
      // Navigate to share page
      navigate(`/share/${quiz.id}`);
    } catch (error) {
      console.error("Failed to create quiz:", error);
      toast({
        title: "Error",
        description: "Failed to create quiz. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <>
      <h1 className="text-3xl font-bold mb-4 text-primary">
        Create Your Quiz
      </h1>
      
      {/* Requirements Alert */}
      <Alert className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Important</AlertTitle>
        <AlertDescription>
          Your quiz requires at least {requiredQuestionsCount} questions. You have {questions.length} so far.
          {questions.length < requiredQuestionsCount && ` Please add ${questionsNeeded} more.`}
        </AlertDescription>
      </Alert>
      
      <Card className="mb-6">
        <CardContent className="pt-6">
          {/* Question Editor */}
          <div className="question-container">
            <div className="mb-4">
              <Label htmlFor="question-text" className="block text-sm font-medium mb-1">
                Question
              </Label>
              <input
                type="text"
                id="question-text"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Ask something about yourself..."
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
              />
            </div>
            
            {/* Image upload area */}
            <div className="mb-6">
              <Label className="block text-sm font-medium mb-2">
                Question Image (Optional)
              </Label>
              
              {questionImagePreview ? (
                <div className="relative w-full h-40 bg-gray-100 rounded-md overflow-hidden mb-2">
                  <img 
                    src={questionImagePreview} 
                    alt="Question preview" 
                    className="w-full h-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full"
                    aria-label="Remove image"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div 
                  className="border-2 border-dashed border-gray-300 rounded-md p-6 text-center cursor-pointer hover:border-primary transition-colors mb-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center">
                    <Image className="h-8 w-8 text-gray-400 mb-2" />
                    <p className="text-sm font-medium text-gray-600 mb-1">Click to upload an image</p>
                    <p className="text-xs text-gray-500">PNG, JPG or GIF (max. 10MB)</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                </div>
              )}
            </div>
            
            {/* Multiple choice editor */}
            <MultipleChoiceEditor
              options={options}
              setOptions={setOptions}
              correctOption={correctOption}
              setCorrectOption={setCorrectOption}
            />
          </div>
          
          <Button 
            type="button" 
            className="w-full mt-6" 
            onClick={handleAddQuestion}
            disabled={uploadImageMutation.isPending}
          >
            {uploadImageMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              questions.length > 0 ? "Add Question" : "Add First Question"
            )}
          </Button>
        </CardContent>
      </Card>
      
      {/* Questions List */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold text-lg mb-3">Your Questions</h3>
          
          <QuestionList 
            questions={questions} 
            onEdit={handleEditQuestion}
            onDelete={handleDeleteQuestion}
          />
          
          {/* Finalize and Share section */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                {questions.length} of {requiredQuestionsCount} questions added
              </span>
              <Button
                type="button"
                className={questions.length >= requiredQuestionsCount ? "btn-primary" : "opacity-50 cursor-not-allowed"}
                disabled={questions.length < requiredQuestionsCount || createQuizMutation.isPending}
                onClick={handleFinishQuiz}
              >
                {createQuizMutation.isPending ? "Creating..." : "Finish & Share"}
              </Button>
            </div>
          </div>

          {/* Ad Placeholder with refresh key to ensure ads reload when questions are added */}
          <AdPlaceholder refreshKey={adRefreshCounter} />
        </CardContent>
      </Card>
    </>
  );
};

export default QuizCreation;