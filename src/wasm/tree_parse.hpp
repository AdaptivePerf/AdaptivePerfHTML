// tree_parse.h
#ifndef TREE_PARSE_H
#define TREE_PARSE_H

#include <vector>
#include <string>
#include <cstdint>

struct Sample {
  uint64_t timestamp;
  uint64_t value;
};

struct TreeNode {
  std::string name;
  uint64_t value;
  bool cold;
  std::vector<Sample> samples;
  std::vector<TreeNode *> children;
};

TreeNode* slice_flame_graph(const TreeNode *node, uint64_t threshold_left,
                            uint64_t threshold_right,
                            const std::string counter_name,
                            bool time_ordered);
void delete_tree(TreeNode *node);

#endif // TREE_PARSE_H
